# dtln-rs-demo

This demo shows how to use [dtln-rs](https://github.com/DataDog/dtln-rs) as a webassembly module in a browser. While the module is fast enough to process audio streams in near real-time so they can be used for audio chat, this demo is more limited and performs recording and processing in separate steps.

The demo consists of a simple webpage that can record, process, and play audio. It uses [Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API) calls to handle the audio, which is then passed to an [AudioWorklet](https://developer.mozilla.org/en-US/docs/Web/API/AudioWorklet) that interfaces with the WASM module.

The required scripts are written in TypeScript and then packaged for browser usage with webpack.

# Running the demo

Install dependencies
> npm install -g webpack

Build and watch for changes
> npm run dev

Serve the project
> npm run serve
