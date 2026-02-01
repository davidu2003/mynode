package collector

import (
	"os"
	"runtime"
	"strings"

	"github.com/shirou/gopsutil/v3/cpu"
	"github.com/shirou/gopsutil/v3/disk"
	"github.com/shirou/gopsutil/v3/host"
	"github.com/shirou/gopsutil/v3/load"
	"github.com/shirou/gopsutil/v3/mem"
	"github.com/shirou/gopsutil/v3/net"
)

type SystemInfo struct {
	Hostname  string `json:"hostname"`
	OS        string `json:"osType"`
	OSVersion string `json:"osVersion"`
	Arch      string `json:"arch"`
	Kernel    string `json:"kernel"`
	CPU       CPUInfo `json:"cpu"`
	Memory    MemoryInfo `json:"memory"`
	Disks     []SystemDiskInfo `json:"disks"`
	Networks  []NetworkInterface `json:"networks"`
}

type Metrics struct {
	CPU     float64      `json:"cpu"`
	Memory  MemoryInfo   `json:"memory"`
	Disk    []DiskInfo   `json:"disk"`
	Network NetworkInfo  `json:"network"`
	Load    LoadInfo     `json:"load"`
	DiskIO  DiskIOInfo   `json:"diskIo"`
}

type MemoryInfo struct {
	Total       uint64  `json:"total"`
	Used        uint64  `json:"used"`
	Available   uint64  `json:"available"`
	UsedPercent float64 `json:"usedPercent"`
}

type CPUInfo struct {
	Model   string `json:"model"`
	Cores   int32  `json:"cores"`
	Threads int    `json:"threads"`
}

type DiskInfo struct {
	Path        string  `json:"path"`
	Total       uint64  `json:"total"`
	Used        uint64  `json:"used"`
	UsedPercent float64 `json:"usedPercent"`
}

type SystemDiskInfo struct {
	Path        string  `json:"path"`
	FsType      string  `json:"fsType"`
	Total       uint64  `json:"total"`
	Used        uint64  `json:"used"`
	UsedPercent float64 `json:"usedPercent"`
}

type NetworkInfo struct {
	RxBytes uint64 `json:"rxBytes"`
	TxBytes uint64 `json:"txBytes"`
}

type NetworkInterface struct {
	Name  string   `json:"name"`
	Addrs []string `json:"addrs"`
}

type LoadInfo struct {
	Load1  float64 `json:"load1"`
	Load5  float64 `json:"load5"`
	Load15 float64 `json:"load15"`
}

type DiskIOInfo struct {
	ReadBytes  uint64 `json:"readBytes"`
	WriteBytes uint64 `json:"writeBytes"`
}

func GetSystemInfo() (*SystemInfo, error) {
	info, err := host.Info()
	if err != nil {
		return nil, err
	}

	hostname, _ := os.Hostname()
	cpuInfos, _ := cpu.Info()
	threads, _ := cpu.Counts(true)
	var cpuInfo CPUInfo
	if len(cpuInfos) > 0 {
		cpuInfo = CPUInfo{
			Model:   cpuInfos[0].ModelName,
			Cores:   cpuInfos[0].Cores,
			Threads: threads,
		}
	}

	memInfo, _ := mem.VirtualMemory()
	memoryInfo := MemoryInfo{}
	if memInfo != nil {
		memoryInfo = MemoryInfo{
			Total:       memInfo.Total,
			Used:        memInfo.Used,
			Available:   memInfo.Available,
			UsedPercent: memInfo.UsedPercent,
		}
	}

	var disks []SystemDiskInfo
	partitions, _ := disk.Partitions(false)
	for _, p := range partitions {
		if strings.HasPrefix(p.Mountpoint, "/snap") ||
			strings.HasPrefix(p.Mountpoint, "/boot") {
			continue
		}
		usage, err := disk.Usage(p.Mountpoint)
		if err != nil {
			continue
		}
		disks = append(disks, SystemDiskInfo{
			Path:        p.Mountpoint,
			FsType:      p.Fstype,
			Total:       usage.Total,
			Used:        usage.Used,
			UsedPercent: usage.UsedPercent,
		})
	}

	var networks []NetworkInterface
	ifaces, _ := net.Interfaces()
	for _, iface := range ifaces {
		var addrs []string
		for _, addr := range iface.Addrs {
			addrs = append(addrs, addr.Addr)
		}
		if len(addrs) == 0 {
			continue
		}
		networks = append(networks, NetworkInterface{
			Name:  iface.Name,
			Addrs: addrs,
		})
	}

	return &SystemInfo{
		Hostname:  hostname,
		OS:        info.Platform,
		OSVersion: info.PlatformVersion,
		Arch:      runtime.GOARCH,
		Kernel:    info.KernelVersion,
		CPU:       cpuInfo,
		Memory:    memoryInfo,
		Disks:     disks,
		Networks:  networks,
	}, nil
}

func GetMetrics() (*Metrics, error) {
	// CPU
	cpuPercent, err := cpu.Percent(0, false)
	cpuUsage := 0.0
	if err == nil && len(cpuPercent) > 0 {
		cpuUsage = cpuPercent[0]
	}

	// Memory
	memInfo, err := mem.VirtualMemory()
	var memoryInfo MemoryInfo
	if err == nil {
		memoryInfo = MemoryInfo{
			Total:       memInfo.Total,
			Used:        memInfo.Used,
			Available:   memInfo.Available,
			UsedPercent: memInfo.UsedPercent,
		}
	}

	// Disk
	var diskInfos []DiskInfo
	partitions, err := disk.Partitions(false)
	if err == nil {
		for _, p := range partitions {
			// 跳过一些特殊的挂载点
			if strings.HasPrefix(p.Mountpoint, "/snap") ||
				strings.HasPrefix(p.Mountpoint, "/boot") {
				continue
			}
			usage, err := disk.Usage(p.Mountpoint)
			if err == nil {
				diskInfos = append(diskInfos, DiskInfo{
					Path:        p.Mountpoint,
					Total:       usage.Total,
					Used:        usage.Used,
					UsedPercent: usage.UsedPercent,
				})
			}
		}
	}

	// Network
	var networkInfo NetworkInfo
	netIO, err := net.IOCounters(false)
	if err == nil && len(netIO) > 0 {
		networkInfo = NetworkInfo{
			RxBytes: netIO[0].BytesRecv,
			TxBytes: netIO[0].BytesSent,
		}
	}

	// Load
	var loadInfo LoadInfo
	loadAvg, err := load.Avg()
	if err == nil {
		loadInfo = LoadInfo{
			Load1:  loadAvg.Load1,
			Load5:  loadAvg.Load5,
			Load15: loadAvg.Load15,
		}
	}

	// Disk IO
	var diskIO DiskIOInfo
	ioCounters, err := disk.IOCounters()
	if err == nil {
		var readBytes uint64
		var writeBytes uint64
		for _, counter := range ioCounters {
			readBytes += counter.ReadBytes
			writeBytes += counter.WriteBytes
		}
		diskIO = DiskIOInfo{
			ReadBytes:  readBytes,
			WriteBytes: writeBytes,
		}
	}

	return &Metrics{
		CPU:     cpuUsage,
		Memory:  memoryInfo,
		Disk:    diskInfos,
		Network: networkInfo,
		Load:    loadInfo,
		DiskIO:  diskIO,
	}, nil
}
