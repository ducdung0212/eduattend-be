export function normalizeIp(ip: string | undefined | null): string {
  if (!ip) return 'unknown';

  // Bỏ prefix IPv6-mapped IPv4: "::ffff:127.0.0.1" -> "127.0.0.1"
  if (ip.startsWith('::ffff:')) {
    ip = ip.substring(7);
  }

  // Gom loopback IPv6 và IPv4 về cùng 1 key (chỉ ảnh hưởng khi chạy local)
  if (ip === '::1') {
    ip = '127.0.0.1';
  }

  return ip;
}
