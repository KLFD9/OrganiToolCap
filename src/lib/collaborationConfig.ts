export const DEFAULT_STUN_SERVERS: RTCIceServer[] = [
  {
    urls: [
      "stun:stun.l.google.com:19302",
      "stun:global.stun.twilio.com:3478",
    ],
  },
];

export function mergeIceServers(additional?: RTCIceServer[]): RTCIceServer[] {
  return [...DEFAULT_STUN_SERVERS, ...(additional ?? [])];
}
