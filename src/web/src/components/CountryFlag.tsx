import { cn } from '../lib/utils';

interface CountryFlagProps {
  countryCode?: string | null;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizeClasses = {
  sm: 'w-4 h-3',
  md: 'w-5 h-4',
  lg: 'w-6 h-5',
};

/**
 * 国旗组件
 * 使用 flag-icons 库展示国家/地区国旗
 * 支持所有 ISO 3166-1 alpha-2 国家代码及特殊地区（HK、TW、MO）
 */
export default function CountryFlag({ countryCode, size = 'sm', className }: CountryFlagProps) {
  if (!countryCode) {
    return null;
  }

  // flag-icons 使用小写国家代码
  const code = countryCode.toLowerCase();

  return (
    <span
      className={cn(
        'fi inline-block rounded-sm shadow-sm',
        `fi-${code}`,
        sizeClasses[size],
        className
      )}
      title={countryCode}
    />
  );
}
