import { signalingClient } from "@/lib/signaling/ws-client";

const ICE_CONFIG: RTCConfiguration = {
  iceServers: [], // LAN only, no STUN/TURN needed
  iceTransportPolicy: "all",
};

const connections = new Map<string, RTCPeerConnection>();

export async function createOffer(targetId: string, localId: string) {
  const pc = createPeerConnection(targetId, localId);
  const dc = pc.createDataChannel("files", { ordered: true });

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  signalingClient.send({
    type: "sdp",
    fromId: localId,
    targetId,
    sdp: { type: offer.type, sdp: offer.sdp! },
  });

  return { pc, dc };
}

export async function handleOffer(
  fromId: string,
  localId: string,
  offer: { type: RTCSdpType; sdp: string },
) {
  const pc = createPeerConnection(fromId, localId);

  await pc.setRemoteDescription(new RTCSessionDescription(offer));
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);

  signalingClient.send({
    type: "sdp",
    fromId: localId,
    targetId: fromId,
    sdp: { type: answer.type, sdp: answer.sdp! },
  });

  return pc;
}

export async function handleAnswer(
  fromId: string,
  answer: { type: RTCSdpType; sdp: string },
) {
  const pc = connections.get(fromId);
  if (pc) await pc.setRemoteDescription(new RTCSessionDescription(answer));
}

export async function handleIceCandidate(
  fromId: string,
  candidate: RTCIceCandidateInit,
) {
  const pc = connections.get(fromId);
  if (pc) await pc.addIceCandidate(new RTCIceCandidate(candidate));
}

export function closeConnection(peerId: string) {
  connections.get(peerId)?.close();
  connections.delete(peerId);
}

function createPeerConnection(remotePeerId: string, localId: string) {
  const pc = new RTCPeerConnection(ICE_CONFIG);
  connections.set(remotePeerId, pc);

  pc.onicecandidate = ({ candidate }) => {
    if (candidate) {
      signalingClient.send({
        type: "ice",
        fromId: localId,
        targetId: remotePeerId,
        candidate: candidate.toJSON(),
      });
    }
  };

  return pc;
}

export function getConnection(peerId: string) {
  return connections.get(peerId);
}
