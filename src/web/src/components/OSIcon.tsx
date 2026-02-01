import { 
  AndroidOutlined, 
  AppleOutlined, 
  WindowsOutlined,
  DesktopOutlined
} from '@ant-design/icons';
import { 
  SiDebian, 
  SiUbuntu, 
  SiCentos, 
  SiFedora, 
  SiAlpinelinux, 
  SiArchlinux, 
  SiRedhat,
  SiSuse,
  SiLinux,
  SiFreebsd,
  SiRaspberrypi
} from 'react-icons/si';
import { cn } from '../lib/utils';

interface OSIconProps {
  osType?: string | null;
  className?: string;
}

export default function OSIcon({ osType, className }: OSIconProps) {
  const normalized = (osType || '').toLowerCase();
  
  const iconProps = {
    className: cn("inline-block", className),
  };

  // Specific Distributions
  if (normalized.includes('debian')) return <SiDebian {...iconProps} className={cn(iconProps.className, "text-[#A81D33]")} title="Debian" />;
  if (normalized.includes('ubuntu')) return <SiUbuntu {...iconProps} className={cn(iconProps.className, "text-[#E95420]")} title="Ubuntu" />;
  if (normalized.includes('centos')) return <SiCentos {...iconProps} className={cn(iconProps.className, "text-[#262577]")} title="CentOS" />;
  if (normalized.includes('fedora')) return <SiFedora {...iconProps} className={cn(iconProps.className, "text-[#51A2DA]")} title="Fedora" />;
  if (normalized.includes('alpine')) return <SiAlpinelinux {...iconProps} className={cn(iconProps.className, "text-[#0D597F]")} title="Alpine" />;
  if (normalized.includes('arch')) return <SiArchlinux {...iconProps} className={cn(iconProps.className, "text-[#1793D1]")} title="Arch Linux" />;
  if (normalized.includes('redhat') || normalized.includes('rhel')) return <SiRedhat {...iconProps} className={cn(iconProps.className, "text-[#EE0000]")} title="Red Hat" />;
  if (normalized.includes('suse') || normalized.includes('sles')) return <SiSuse {...iconProps} className={cn(iconProps.className, "text-[#73BA25]")} title="SUSE" />;
  if (normalized.includes('freebsd')) return <SiFreebsd {...iconProps} className={cn(iconProps.className, "text-[#AB2B28]")} title="FreeBSD" />;
  if (normalized.includes('raspberry') || normalized.includes('raspbian')) return <SiRaspberrypi {...iconProps} className={cn(iconProps.className, "text-[#C51A4A]")} title="Raspberry Pi" />;

  // General Families
  if (normalized.includes('windows')) return <WindowsOutlined {...iconProps} className={cn(iconProps.className, "text-[#0078D6]")} title="Windows" />;
  if (normalized.includes('mac') || normalized.includes('darwin') || normalized.includes('osx')) return <AppleOutlined {...iconProps} title="macOS" />;
  if (normalized.includes('android')) return <AndroidOutlined {...iconProps} className={cn(iconProps.className, "text-[#3DDC84]")} title="Android" />;
  
  // Fallback for generic Linux
  if (normalized.includes('linux')) return <SiLinux {...iconProps} title="Linux" />;
  
  // Unknown
  return <DesktopOutlined {...iconProps} className={cn(iconProps.className, "text-slate-400")} title="Unknown OS" />;
}
