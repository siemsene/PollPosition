// Single source of truth for the student join URL, shared by the QR code,
// the copy-link button, and anything else that hands the link out.
export function studentRoomUrl(roomCode: string): string {
  const u = new URL(window.location.href)
  u.pathname = '/room'
  u.search = `?room=${encodeURIComponent(roomCode)}`
  u.hash = ''
  return u.toString()
}
