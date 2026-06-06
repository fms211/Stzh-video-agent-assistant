export function needsUnoptimized(url: string) {
  return url.startsWith("blob:") || url.startsWith("data:");
}
