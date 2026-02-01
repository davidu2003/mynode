package main

import (
	"flag"
	"log"
	"os"
	"os/signal"
	"syscall"

	"github.com/mynode/agent/internal/client"
	"github.com/mynode/agent/internal/config"
)

var Version = "0.1.0"

func main() {
	configPath := flag.String("config", "/etc/mynode/agent.yaml", "Path to config file")
	flag.Parse()

	log.Printf("Mynode Agent v%s starting...", Version)

	// 加载配置
	cfg, err := config.Load(*configPath)
	if err != nil {
		log.Fatalf("Failed to load config: %v", err)
	}

	// 创建客户端
	c := client.New(cfg)

	// 启动连接
	go c.Run()

	// 等待退出信号
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("Shutting down agent...")
	c.Close()
}
