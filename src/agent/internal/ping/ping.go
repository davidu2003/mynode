package ping

import (
	"bytes"
	"fmt"
	"net"
	"os/exec"
	"regexp"
	"strconv"
	"strings"
	"time"
)

var timeRegex = regexp.MustCompile(`time=([0-9.]+)\s*ms`)

func Execute(kind string, host string, port int, timeoutMs int) (bool, float64, string) {
	timeout := time.Duration(timeoutMs) * time.Millisecond
	if timeout <= 0 {
		timeout = 5 * time.Second
	}

	switch kind {
	case "icmp":
		return pingICMP(host, timeout)
	case "tcp":
		if port <= 0 {
			return false, 0, "invalid port"
		}
		return pingTCP(host, port, timeout)
	default:
		return false, 0, "unsupported type"
	}
}

func pingTCP(host string, port int, timeout time.Duration) (bool, float64, string) {
	address := fmt.Sprintf("%s:%d", host, port)
	start := time.Now()
	conn, err := net.DialTimeout("tcp", address, timeout)
	if err != nil {
		return false, 0, err.Error()
	}
	conn.Close()
	return true, float64(time.Since(start).Milliseconds()), ""
}

func pingICMP(host string, timeout time.Duration) (bool, float64, string) {
	timeoutSec := int(timeout.Seconds())
	if timeoutSec <= 0 {
		timeoutSec = 1
	}

	cmd := exec.Command("ping", "-c", "1", "-W", strconv.Itoa(timeoutSec), host)
	var stdout bytes.Buffer
	var stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	err := cmd.Run()
	output := stdout.String()
	if err != nil {
		if stderr.Len() > 0 {
			return false, 0, strings.TrimSpace(stderr.String())
		}
		return false, 0, err.Error()
	}

	match := timeRegex.FindStringSubmatch(output)
	if len(match) < 2 {
		return true, 0, ""
	}

	latency, parseErr := strconv.ParseFloat(match[1], 64)
	if parseErr != nil {
		return true, 0, ""
	}

	return true, latency, ""
}
