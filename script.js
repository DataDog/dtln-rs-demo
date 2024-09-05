
let handle;
let audioContext;
let rawChunks;
let denoisedChunks;
let scriptProcessor;
let source;
let userMediaStream;
let stream;

const DEFAULT_TARGET_SAMPLE_RATE = 16000;

// ScriptProcessorNode is slow and unstable, and trips up with small sample sizes.
const SCRIPT_PROCESSOR_SAMPLE_SIZE = 4096;

// DTLN was trained and tuned to work with this specific sample size.
const DTLN_FIXED_SAMPLE_SIZE = 512;

DtlnPlugin.postRun = [function() {
    console.log('dtln-rs loaded');
    handle = DtlnPlugin.dtln_create();
}];

function setAudioSrc(){
    document.getElementById('rawAudio').src = document.getElementById('selectSoundFile').value;
}

function toggleRecordingButtons(){
    document.getElementById('btnStart').disabled = !document.getElementById('btnStart').disabled;
    document.getElementById('btnStop').disabled = !document.getElementById('btnStop').disabled;
}

async function getAudioStream(){
     // Get audio stream from the user's microphone
    userMediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
}

// Get audio stream from an audio element, e.g. for a loaded file rather than recorded
function getAudioStreamFromElement(){
    // Create an AudioContext
    audioContext = new AudioContext({ sampleRate: DEFAULT_TARGET_SAMPLE_RATE });
    source = audioContext.createMediaElementSource(document.getElementById('rawAudio'));
 
    processAudio(audioContext);

    //TODO I think this is broken because we are creating the elementSource before wiring up the .onaudioprocess event
}

function processAudio(context){
    rawChunks = [];

    // Create a ScriptProcessorNode to capture audio data
    scriptProcessor = context.createScriptProcessor(SCRIPT_PROCESSOR_SAMPLE_SIZE, 1, 1);

    scriptProcessor.onaudioprocess = async function(event) {
        // Get the input buffer
        const inputBuffer = event.inputBuffer;

        // Get the PCM data from the input buffer
        const pcmData = inputBuffer.getChannelData(0);

        // Copy the PCM data to a new Float32Array (copy it)
        let pcmArray = new Float32Array(pcmData.length);
        pcmArray.set(pcmData);

        // Store raw PCM data
        rawChunks.push(pcmArray);
    };

      // Connect the nodes
    source.connect(scriptProcessor);
    scriptProcessor.connect(context.destination);
}

async function startRecording() {
    toggleRecordingButtons();

    if(!userMediaStream){
        await getAudioStream();
    }
    // Clone the stream to avoid additional permissions prompts
    stream = userMediaStream.clone();

    // Create an AudioContext
    audioContext = new AudioContext({ sampleRate: DEFAULT_TARGET_SAMPLE_RATE });

    // Create a MediaStreamAudioSourceNode from the stream
    source = audioContext.createMediaStreamSource(stream);

    processAudio(audioContext);
}

function denoiseChunks() {
    denoisedChunks = [];

    // Iterate over all noisy chunks, and break them into chunks of 512 samples for dtln to denoise.
    let output = new Float32Array(DTLN_FIXED_SAMPLE_SIZE); // Create an output array

    for (let i = 0; i < rawChunks.length; i++) {
        for (let j = 0; j < rawChunks[i].length; j += DTLN_FIXED_SAMPLE_SIZE) {
            // Create a new Float32Array with 512 samples
            let chunk = rawChunks[i].subarray(j, j + DTLN_FIXED_SAMPLE_SIZE);

            // Denoise the chunk
            DtlnPlugin.dtln_denoise(handle, chunk, output);

            // Store the denoised PCM data
            denoisedChunks.push(new Float32Array(output));
        }
    }
}

function cleanupAudioResources() {
    scriptProcessor.onaudioprocess = null;
    scriptProcessor.disconnect();
    source.disconnect();
}

async function denoise(){
    if(!rawChunks){
        getAudioStreamFromElement();
    }

    startTime = performance.now();
    denoiseChunks();
    stopTime = performance.now();
    console.log('Denoising took ' + (stopTime - startTime) + ' ms');

    // Combine all denoised PCM chunks into a single Blob
    let denoisedBuffer = mergeFloat32Arrays(denoisedChunks);
    let denoisedBlob = createWavBlob(denoisedBuffer, audioContext.sampleRate);
    let denoisedAudioURL = URL.createObjectURL(denoisedBlob);
    document.getElementById('denoisedAudio').src = denoisedAudioURL;
    // Close the audio context
    audioContext.close();
}

async function stopRecording() {
    if (scriptProcessor && source && audioContext) {
        cleanupAudioResources();

        stream.getTracks().forEach(track => track.stop());
        // Combine all raw PCM chunks into a single Blob
        let rawBuffer = mergeFloat32Arrays(rawChunks);
        let rawBlob = createWavBlob(rawBuffer, audioContext.sampleRate);

        // Set audio elements to play the blobs
        let rawAudioURL = URL.createObjectURL(rawBlob);
        document.getElementById('rawAudio').src = rawAudioURL;

        scriptProcessor = null;
        source = null;
        stream = null;
        toggleRecordingButtons();
    } else {
        console.error('Recording not started');
    }
}

function createWavBlob(buffer, sampleRate) {
    const numOfChannels = 1;
    const numOfFrames = buffer.length;
    const bufferLength = numOfFrames * numOfChannels * 2; // 2 bytes per sample (16-bit PCM)
    const wavBuffer = new ArrayBuffer(44 + bufferLength);
    const view = new DataView(wavBuffer);

    // RIFF chunk descriptor
    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + bufferLength, true);
    writeString(view, 8, 'WAVE');

    // FMT sub-chunk
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true); // Sub-chunk size
    view.setUint16(20, 1, true); // Audio format (1 = PCM)
    view.setUint16(22, numOfChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * numOfChannels * 2, true); // Byte rate
    view.setUint16(32, numOfChannels * 2, true); // Block align
    view.setUint16(34, 16, true); // Bits per sample

    // Data sub-chunk
    writeString(view, 36, 'data');
    view.setUint32(40, bufferLength, true);

    // Write PCM samples
    let offset = 44;
    for (let i = 0; i < buffer.length; i++) {
        const sample = Math.max(-1, Math.min(1, buffer[i]));
        view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
        offset += 2;
    }

    return new Blob([view], { type: 'audio/wav' });
}

function writeString(view, offset, string) {
    for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
    }
}

function mergeFloat32Arrays(arrays) {
    // Calculate the total length of all arrays
    let totalLength = arrays.reduce((sum, array) => sum + array.length, 0);
    // Create a new Float32Array with the total length
    let result = new Float32Array(totalLength);
    // Copy each array into the result
    let offset = 0;
    for (let array of arrays) {
        result.set(array, offset);
        offset += array.length;
    }
    return result;
}