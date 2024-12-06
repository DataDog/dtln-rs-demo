import audioWorkletUrl from './audio-worklet/main?worker&url';

const DEFAULT_TARGET_SAMPLE_RATE = 16000;

let audioStream;
let audioChunks = [];
let rawAudio = document.getElementById("rawAudio");
let denoisedAudio = document.getElementById("denoisedAudio");
let btnStart = document.getElementById("btnStart");
let btnStop = document.getElementById("btnStop");
let btnDenoise = document.getElementById("btnDenoise");
let audioContext = null;
let stream = null;
let source = null;
let destination = null;

let suppressionWorkletNode = null;

btnStart.addEventListener('click', async function startRecording() {
  // Get audio stream from the user's microphone
  audioStream = await navigator.mediaDevices.getUserMedia({
    audio: true,
  });

  if (!audioContext) {
    audioContext = new AudioContext({
      sampleRate: DEFAULT_TARGET_SAMPLE_RATE,
    });
  }

  // Create a MediaStreamAudioSourceNode from the stream
  source = audioContext.createMediaStreamSource(audioStream);
  destination = audioContext.createMediaStreamDestination();

  console.log(
    "Noise suppression module initialized. Starting worklet."
  );

  if (!suppressionWorkletNode) {
    audioContext.audioWorklet
      .addModule(audioWorkletUrl)
      .then(() => {
        suppressionWorkletNode = new AudioWorkletNode(
          audioContext,
          "denoiser"
        );
        suppressionWorkletNode.port.onmessage = (event) => {
          // Metrics are received here.
          console.log(event.data);
        };
      });
  } else if (destination) {
    source.connect(suppressionWorkletNode).connect(destination);
  }

  audioStream.getAudioTracks()[0].enabled = true;

  btnStart.disabled = true;
  btnStop.disabled = false;
})

btnStop.addEventListener('click', function stopRecording() {
  audioStream.getTracks().forEach((track) => track.stop());

  denoisedAudio.srcObject = destination.stream;

  btnStart.disabled = false;
  btnStop.disabled = true;
});

btnDenoise.addEventListener('click', async function denoise() {
  // TODO
});
