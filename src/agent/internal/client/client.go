package client

import (
	"context"
	"encoding/json"
	"log"
	"net/url"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"github.com/mynode/agent/internal/collector"
	"github.com/mynode/agent/internal/config"
	"github.com/mynode/agent/internal/executor"
	"github.com/mynode/agent/internal/ping"
)

type Message struct {
	ID        string      `json:"id,omitempty"`
	Type      string      `json:"type"`
	Payload   interface{} `json:"payload,omitempty"`
	Error     string      `json:"error,omitempty"`
	Timestamp int64       `json:"timestamp,omitempty"`
}

type Client struct {
	config    *config.Config
	conn      *websocket.Conn
	mu        sync.Mutex
	done      chan struct{}
	connected bool
	pingMu    sync.Mutex
	pingStops map[int]context.CancelFunc
}

func New(cfg *config.Config) *Client {
	return &Client{
		config: cfg,
		done:   make(chan struct{}),
		pingStops: make(map[int]context.CancelFunc),
	}
}

func (c *Client) Run() {
	for {
		select {
		case <-c.done:
			return
		default:
			if err := c.connect(); err != nil {
				log.Printf("Connection failed: %v, retrying in %ds...", err, c.config.ReconnectDelay)
				time.Sleep(time.Duration(c.config.ReconnectDelay) * time.Second)
				continue
			}

			c.connected = true
			c.sendSystemInfo()
			c.startHeartbeat()
			c.startMetricsReporter()
			c.listen()
			c.connected = false

			log.Printf("Disconnected, reconnecting in %ds...", c.config.ReconnectDelay)
			time.Sleep(time.Duration(c.config.ReconnectDelay) * time.Second)
		}
	}
}

func (c *Client) connect() error {
	u, err := url.Parse(c.config.Server)
	if err != nil {
		return err
	}

	// 添加token到query
	q := u.Query()
	q.Set("token", c.config.Token)
	u.RawQuery = q.Encode()

	log.Printf("Connecting to %s...", u.Host)

	conn, _, err := websocket.DefaultDialer.Dial(u.String(), nil)
	if err != nil {
		return err
	}

	c.mu.Lock()
	c.conn = conn
	c.mu.Unlock()

	log.Println("Connected to server")
	return nil
}

func (c *Client) Close() {
	close(c.done)
	c.mu.Lock()
	if c.conn != nil {
		c.conn.Close()
	}
	c.mu.Unlock()
}

func (c *Client) send(msg Message) error {
	c.mu.Lock()
	defer c.mu.Unlock()

	if c.conn == nil {
		return nil
	}

	msg.Timestamp = time.Now().UnixMilli()
	return c.conn.WriteJSON(msg)
}

func (c *Client) sendSystemInfo() {
	info, err := collector.GetSystemInfo()
	if err != nil {
		log.Printf("Failed to collect system info: %v", err)
		return
	}

	c.send(Message{
		Type:    "system_info",
		Payload: info,
	})
}

func (c *Client) startHeartbeat() {
	go func() {
		ticker := time.NewTicker(time.Duration(c.config.HeartbeatInterval) * time.Second)
		defer ticker.Stop()

		for {
			select {
			case <-c.done:
				return
			case <-ticker.C:
				if !c.connected {
					return
				}
				c.send(Message{Type: "heartbeat"})
			}
		}
	}()
}

func (c *Client) startMetricsReporter() {
	go func() {
		ticker := time.NewTicker(time.Duration(c.config.MetricsInterval) * time.Second)
		defer ticker.Stop()

		for {
			select {
			case <-c.done:
				return
			case <-ticker.C:
				if !c.connected {
					return
				}
				metrics, err := collector.GetMetrics()
				if err != nil {
					log.Printf("Failed to collect metrics: %v", err)
					continue
				}
				c.send(Message{
					Type:    "metrics",
					Payload: metrics,
				})
			}
		}
	}()
}

func (c *Client) listen() {
	for {
		select {
		case <-c.done:
			return
		default:
			_, data, err := c.conn.ReadMessage()
			if err != nil {
				log.Printf("Read error: %v", err)
				return
			}

			var msg Message
			if err := json.Unmarshal(data, &msg); err != nil {
				log.Printf("Failed to parse message: %v", err)
				continue
			}

			c.handleMessage(msg)
		}
	}
}

func (c *Client) handleMessage(msg Message) {
	switch msg.Type {
	case "connected":
		log.Println("Server confirmed connection")

	case "heartbeat_ack":
		// 心跳确认，无需处理

	case "exec":
		go c.handleExec(msg)

	case "read_file":
		go c.handleReadFile(msg)

	case "write_file":
		go c.handleWriteFile(msg)

	case "get_system_info":
		go c.sendSystemInfo()

	case "get_metrics":
		go func() {
			metrics, err := collector.GetMetrics()
			if err != nil {
				c.sendResponse(msg.ID, nil, err.Error())
				return
			}
			c.sendResponse(msg.ID, metrics, "")
		}()

	case "ping_config":
		go c.handlePingConfig(msg)

	default:
		log.Printf("Unknown message type: %s", msg.Type)
	}
}

func (c *Client) handleExec(msg Message) {
	payload, ok := msg.Payload.(map[string]interface{})
	if !ok {
		c.sendResponse(msg.ID, nil, "Invalid payload")
		return
	}

	command, _ := payload["command"].(string)
	timeout := 60000
	if t, ok := payload["timeout"].(float64); ok {
		timeout = int(t)
	}

	result, err := executor.Execute(command, timeout)
	if err != nil {
		c.sendResponse(msg.ID, nil, err.Error())
		return
	}

	c.sendResponse(msg.ID, result, "")
}

func (c *Client) handleReadFile(msg Message) {
	payload, ok := msg.Payload.(map[string]interface{})
	if !ok {
		c.sendResponse(msg.ID, nil, "Invalid payload")
		return
	}

	path, _ := payload["path"].(string)
	content, err := executor.ReadFile(path)
	if err != nil {
		c.sendResponse(msg.ID, nil, err.Error())
		return
	}

	c.sendResponse(msg.ID, map[string]string{"content": content}, "")
}

func (c *Client) handleWriteFile(msg Message) {
	payload, ok := msg.Payload.(map[string]interface{})
	if !ok {
		c.sendResponse(msg.ID, nil, "Invalid payload")
		return
	}

	path, _ := payload["path"].(string)
	content, _ := payload["content"].(string)

	if err := executor.WriteFile(path, content); err != nil {
		c.sendResponse(msg.ID, nil, err.Error())
		return
	}

	c.sendResponse(msg.ID, map[string]bool{"success": true}, "")
}

type PingMonitor struct {
	ID       int     `json:"id"`
	Name     string  `json:"name"`
	Type     string  `json:"type"`
	Host     string  `json:"host"`
	Port     int     `json:"port"`
	Interval int     `json:"interval"`
	Timeout  int     `json:"timeout"`
	Enabled  bool    `json:"enabled"`
}

func (c *Client) handlePingConfig(msg Message) {
	payload, ok := msg.Payload.(map[string]interface{})
	if !ok {
		return
	}

	rawMonitors, ok := payload["monitors"].([]interface{})
	if !ok {
		return
	}

	var monitors []PingMonitor
	for _, item := range rawMonitors {
		m, ok := item.(map[string]interface{})
		if !ok {
			continue
		}
		monitor := PingMonitor{
			ID:       int(getFloat(m, "id")),
			Name:     getString(m, "name"),
			Type:     getString(m, "type"),
			Host:     getString(m, "host"),
			Port:     int(getFloat(m, "port")),
			Interval: int(getFloat(m, "interval")),
			Timeout:  int(getFloat(m, "timeout")),
			Enabled:  getBool(m, "enabled", true),
		}
		if monitor.ID == 0 || monitor.Host == "" || monitor.Interval <= 0 {
			continue
		}
		monitors = append(monitors, monitor)
	}

	c.applyPingConfig(monitors)
}

func (c *Client) applyPingConfig(monitors []PingMonitor) {
	c.pingMu.Lock()
	for _, cancel := range c.pingStops {
		cancel()
	}
	c.pingStops = make(map[int]context.CancelFunc)
	c.pingMu.Unlock()

	for _, monitor := range monitors {
		if !monitor.Enabled {
			continue
		}
		ctx, cancel := context.WithCancel(context.Background())
		c.pingMu.Lock()
		c.pingStops[monitor.ID] = cancel
		c.pingMu.Unlock()
		go c.runPingMonitor(ctx, monitor)
	}
}

func (c *Client) runPingMonitor(ctx context.Context, monitor PingMonitor) {
	interval := time.Duration(monitor.Interval) * time.Second
	if interval < 10*time.Second {
		interval = 10 * time.Second
	}
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			success, latency, errMsg := ping.Execute(monitor.Type, monitor.Host, monitor.Port, monitor.Timeout)
			c.send(Message{
				Type: "ping_results",
				Payload: map[string]interface{}{
					"results": []map[string]interface{}{
						{
							"monitorId": monitor.ID,
							"success":   success,
							"latency":   latency,
							"error":     errMsg,
						},
					},
				},
			})
		}
	}
}

func getString(m map[string]interface{}, key string) string {
	if val, ok := m[key].(string); ok {
		return val
	}
	return ""
}

func getFloat(m map[string]interface{}, key string) float64 {
	if val, ok := m[key].(float64); ok {
		return val
	}
	if val, ok := m[key].(int); ok {
		return float64(val)
	}
	return 0
}

func getBool(m map[string]interface{}, key string, defaultValue bool) bool {
	if val, ok := m[key].(bool); ok {
		return val
	}
	return defaultValue
}

func (c *Client) sendResponse(id string, payload interface{}, errMsg string) {
	c.send(Message{
		ID:      id,
		Type:    "response",
		Payload: payload,
		Error:   errMsg,
	})
}
