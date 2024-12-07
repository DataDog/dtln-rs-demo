const DEFAULT_TARGET_SAMPLE_RATE = 16000;

let audioStream;
let noisyAudioChunks = [];
let denoisedAudioChunks = [];
const rawAudio = document.getElementById("rawAudio");
const denoisedAudio = document.getElementById("denoisedAudio");
denoisedAudio.autoplay = false;
const btnStart = document.getElementById("btnStart");
const btnStop = document.getElementById("btnStop");
const loadClip = document.getElementById("loadClip");
let audioContext = null;
let source = null;
let recordedAudioBuffer = null;

let destination = null;
let denoisedRecorder = null;
let noisyRecorder = null;
let suppressionWorkletNode = null;

btnStart.addEventListener("click", startRecording);
btnStop.addEventListener("click", stopRecording);

async function startRecording() {
  btnStart.disabled = true;
  try {
    await initializeAudioStream();
    initializeAudioContext();
    initializeRecorders();
    console.log("Noise suppression module initialized. Starting worklet.");
    noisyRecorder.start();
    btnStart.disabled = true;
    btnStop.disabled = false;
  } catch (error) {
    console.error("Error starting recording:", error);
  }
}

async function initializeAudioStream() {
  audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
}

function initializeAudioContext() {
  if (!audioContext) {
    audioContext = new AudioContext({
      sampleRate: DEFAULT_TARGET_SAMPLE_RATE,
    });
  }
  source = audioContext.createMediaStreamSource(audioStream);
  source.channelCount = 1;
  destination = audioContext.createMediaStreamDestination();
  destination.channelCount = 1;
}

function initializeRecorders() {
  noisyRecorder = new MediaRecorder(audioStream);
  noisyRecorder.ondataavailable = handleNoisyDataAvailable;
  denoisedRecorder = new MediaRecorder(
    audioContext.createMediaStreamDestination().stream
  );
  denoisedRecorder.ondataavailable = handleDenoisedDataAvailable;
  noisyRecorder.onstop = processRecordedAudio;
}

function handleNoisyDataAvailable(event) {
  if (event.data.size > 0) {
    noisyAudioChunks.push(event.data);
  }
}

function handleDenoisedDataAvailable(event) {
  if (event.data.size > 0) {
    denoisedAudioChunks.push(event.data);
  }
}

async function processRecordedAudio() {
  rawAudio.src = URL.createObjectURL(
    new Blob(noisyAudioChunks, { type: "audio/webm" })
  );
  const audioBlob = new Blob(noisyAudioChunks, { type: "audio/webm" });
  const arrayBuffer = await audioBlob.arrayBuffer();
  recordedAudioBuffer = await audioContext.decodeAudioData(arrayBuffer);
  noisyAudioChunks = [];
  await processAudioBufferWithWorklet();
}

async function processAudioBufferWithWorklet() {
  const offlineAudioContext = new OfflineAudioContext(
    recordedAudioBuffer.numberOfChannels,
    recordedAudioBuffer.length,
    recordedAudioBuffer.sampleRate
  );
  await offlineAudioContext.audioWorklet.addModule("/audio-worklet.js");
  const suppressionWorkletNode = new AudioWorkletNode(
    offlineAudioContext,
    "NoiseSuppressionWorker"
  );
  suppressionWorkletNode.port.onmessage = handleWorkletMessage;
  const offlineSource = offlineAudioContext.createBufferSource();
  offlineSource.buffer = recordedAudioBuffer;
  offlineSource.connect(suppressionWorkletNode);
  suppressionWorkletNode.connect(offlineAudioContext.destination);
  offlineSource.start();
  const renderedBuffer = await offlineAudioContext.startRendering();
  convertBufferToWavAndSetSource(renderedBuffer);
}

function handleWorkletMessage(event) {
  if (event.data === "ready") {
    console.log("Worklet is ready...");
  }
  console.log(event.data);
}

function convertBufferToWavAndSetSource(renderedBuffer) {
  const wavBuffer = audioBufferToWav(renderedBuffer);
  const audioBlob = new Blob([wavBuffer], { type: "audio/wav" });
  denoisedAudio.src = URL.createObjectURL(audioBlob);
  denoisedAudio.load();
}

function audioBufferToWav(buffer) {
  const numOfChan = buffer.numberOfChannels,
    length = buffer.length * numOfChan * 2 + 44,
    bufferArray = new ArrayBuffer(length),
    view = new DataView(bufferArray),
    channels = [],
    sampleRate = buffer.sampleRate;
  let pos = 0;
  let offset = 0;

  setUint32(0x46464952); // "RIFF"
  setUint32(length - 8); // file length - 8
  setUint32(0x45564157); // "WAVE"

  setUint32(0x20746d66); // "fmt " chunk
  setUint32(16); // length = 16
  setUint16(1); // PCM (uncompressed)
  setUint16(numOfChan);
  setUint32(sampleRate);
  setUint32(sampleRate * 2 * numOfChan); // avg. bytes/sec
  setUint16(numOfChan * 2); // block-align
  setUint16(16); // 16-bit (hardcoded in this demo)

  setUint32(0x61746164); // "data" - chunk
  setUint32(length - pos - 4); // chunk length

  for (let i = 0; i < buffer.numberOfChannels; i++)
    channels.push(buffer.getChannelData(i));

  while (pos < length) {
    for (let i = 0; i < numOfChan; i++) {
      const sample = Math.max(-1, Math.min(1, channels[i][offset])); // clamp
      view.setInt16(pos, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true); // convert to PCM
      pos += 2;
    }
    offset++;
  }

  function setUint16(data) {
    view.setUint16(pos, data, true);
    pos += 2;
  }

  function setUint32(data) {
    view.setUint32(pos, data, true);
    pos += 4;
  }

  return bufferArray;
}

function stopRecording() {
  if (audioStream) {
    audioStream.getTracks().forEach((track) => track.stop());
  }
  if (denoisedRecorder && denoisedRecorder.state !== "inactive") {
    denoisedRecorder.stop();
    noisyRecorder.stop();
  }
  btnStop.disabled = true;
  btnStart.disabled = false;
}

function cleanupAudioNodes() {
  if (source) {
    source.disconnect();
  }
  if (suppressionWorkletNode) {
    suppressionWorkletNode.disconnect();
  }
  if (destination) {
    destination.disconnect();
  }

  audioContext = null;
  source = null;
  destination = null;
  suppressionWorkletNode = null;
}
