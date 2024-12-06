const DEFAULT_TARGET_SAMPLE_RATE = 16000;

let audioStream;
let noisyAudioChunks = [];
let denoisedAudioChunks = [];
let rawAudio = document.getElementById("rawAudio");
let denoisedAudio = document.getElementById("denoisedAudio");
let btnStart = document.getElementById("btnStart");
let btnStop = document.getElementById("btnStop");
let btnDenoise = document.getElementById("btnDenoise");
let audioContext = null;
let stream = null;
let source = null;
let destination = null;
let denoisedRecorder = null;
let noisyRecorder = null;

let suppressionWorkletNode = null;

btnStart.addEventListener("click", async function startRecording() {
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
  destination.channelCount = 1;

  noisyRecorder = new MediaRecorder(audioStream);
  noisyRecorder.ondataavailable = (event) => {
    if (event.data.size > 0) {
      noisyAudioChunks.push(event.data);
    }
  };

  denoisedRecorder = new MediaRecorder(destination.stream);
  denoisedRecorder.ondataavailable = (event) => {
    if (event.data.size > 0) {
      denoisedAudioChunks.push(event.data);
    }
  };

  noisyRecorder.onstop = () => {
    rawAudio.src = URL.createObjectURL(
      new Blob(noisyAudioChunks, { type: "audio/webm" })
    );
    noisyAudioChunks = [];
  };

  denoisedRecorder.onstop = () => {
    denoisedAudio.src = URL.createObjectURL(
      new Blob(denoisedAudioChunks, { type: "audio/webm" })
    );
    denoisedAudioChunks = [];

    if (source) {
      source.disconnect();
    }
    if (suppressionWorkletNode) {
      suppressionWorkletNode.disconnect();
    }
    if (destination) {
      destination.disconnect();
    }
    if (audioContext) {
      audioContext.close();
    }

    audioContext = null;
    source = null;
    destination = null;
    suppressionWorkletNode = null;
  };
  console.log("Noise suppression module initialized. Starting worklet.");

  if (!suppressionWorkletNode) {
    audioContext.audioWorklet.addModule("/audio-worklet.js").then(() => {
      suppressionWorkletNode = new AudioWorkletNode(
        audioContext,
        "NoiseSuppressionWorker"
      );
      suppressionWorkletNode.port.onmessage = (event) => {
        // Metrics are received here.
        console.log(event.data);
      };

      source.connect(suppressionWorkletNode).connect(destination);
      denoisedRecorder.start();
      noisyRecorder.start();
    });
  }

  btnStart.disabled = true;
  btnStop.disabled = false;
});

btnStop.addEventListener("click", function stopRecording() {
  if (audioStream) {
    audioStream.getTracks().forEach((track) => track.stop());
  }

  if (denoisedRecorder) {
    denoisedRecorder.stop();
    noisyRecorder.stop();
  }

  btnStart.disabled = false;
  btnStop.disabled = true;
});
