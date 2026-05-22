import { signalingClient } from "@/lib/signaling/ws-client";

const ICE_CONFIG: RTCConfiguration = {
  iceServers: [],
  iceTransportPolicy: "all",
};

const connections = new Map<string, RTCPeerConnection>();
const dataChannels = new Map<string, RTCDataChannel>();
const makingOffer = new Map<string, boolean>();

export function getDataChannel(peerId: string): RTCDataChannel | undefined {
  return dataChannels.get(peerId);
}

export function getConnection(peerId: string): RTCPeerConnection | undefined {
  return connections.get(peerId);
}

export function closeConnection(peerId: string) {
  connections.get(peerId)?.close();
  connections.delete(peerId);
  dataChannels.delete(peerId);
  makingOffer.delete(peerId);
}

export function setupPeerConnection(
  localId: string,
  remoteId: string,
  onChannel: (dc: RTCDataChannel) => void,
): RTCPeerConnection {
  const existing = connections.get(remoteId);
  if (existing) return existing;

  const pc = new RTCPeerConnection(ICE_CONFIG);
  connections.set(remoteId, pc);

  pc.onnegotiationneeded = async () => {
    try {
      makingOffer.set(remoteId, true);
      await pc.setLocalDescription();
      signalingClient.send({
        type: "sdp",
        fromId: localId,
        targetId: remoteId,
        sdp: {
          type: pc.localDescription!.type as RTCSdpType,
          sdp: pc.localDescription!.sdp,
        },
      });
    } catch (err) {
      console.error("negotiation error", err);
    } finally {
      makingOffer.set(remoteId, false);
    }
  };

  pc.onicecandidate = ({ candidate }) => {
    if (candidate) {
      signalingClient.send({
        type: "ice",
        fromId: localId,
        targetId: remoteId,
        candidate: candidate.toJSON(),
      });
    }
  };

  pc.ondatachannel = ({ channel }) => {
    dataChannels.set(remoteId, channel);
    onChannel(channel);
  };

  return pc;
}

export async function handleSdp(
  localId: string,
  remoteId: string,
  sdp: { type: RTCSdpType; sdp: string },
  onChannel: (dc: RTCDataChannel) => void,
) {
  const pc = setupPeerConnection(localId, remoteId, onChannel);
  const isPolite = localId < remoteId;
  const isOffering = makingOffer.get(remoteId) ?? false;
  const offerCollision =
    sdp.type === "offer" && (isOffering || pc.signalingState !== "stable");

  if (!isPolite && offerCollision) return;

  await pc.setRemoteDescription(new RTCSessionDescription(sdp));

  if (sdp.type === "offer") {
    await pc.setLocalDescription();
    signalingClient.send({
      type: "sdp",
      fromId: localId,
      targetId: remoteId,
      sdp: {
        type: pc.localDescription!.type as RTCSdpType,
        sdp: pc.localDescription!.sdp,
      },
    });
  }
}

export async function handleIce(
  localId: string,
  remoteId: string,
  candidate: RTCIceCandidateInit,
  onChannel: (dc: RTCDataChannel) => void,
) {
  const pc = setupPeerConnection(localId, remoteId, onChannel);
  try {
    await pc.addIceCandidate(new RTCIceCandidate(candidate));
  } catch (err) {
    console.error("ice candidate error", err);
  }
}

export function initiateConnection(
  localId: string,
  remoteId: string,
  onChannel: (dc: RTCDataChannel) => void,
): RTCDataChannel {
  const pc = setupPeerConnection(localId, remoteId, onChannel);
  const dc = pc.createDataChannel("files", { ordered: true });
  dataChannels.set(remoteId, dc);
  onChannel(dc);
  return dc;
}
