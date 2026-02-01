package config

import (
	"os"

	"gopkg.in/yaml.v3"
)

type Config struct {
	Server            string `yaml:"server"`
	Token             string `yaml:"token"`
	HeartbeatInterval int    `yaml:"heartbeat_interval"` // seconds
	MetricsInterval   int    `yaml:"metrics_interval"`   // seconds
	ReconnectDelay    int    `yaml:"reconnect_delay"`    // seconds
}

func Load(path string) (*Config, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}

	cfg := &Config{
		HeartbeatInterval: 5,
		MetricsInterval:   10,
		ReconnectDelay:    5,
	}

	if err := yaml.Unmarshal(data, cfg); err != nil {
		return nil, err
	}

	return cfg, nil
}
