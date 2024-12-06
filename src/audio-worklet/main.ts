import './global-polyfills';

import type { DtlnPluginOpaqueHandle } from 'dtln-rs';
import dtln from "./dtln.js";

export interface NoiseSuppressionMetrics {
  avg_samples_processed: number;
  avg_input_signal: number;
  avg_output_signal: number;
  avg_signal_enhancement: number;
  avg_signal_suppression: number;
}

const DTLN_FIXED_BUFFER_SIZE = 512;

interface AudioWorkletProcessor {
  readonly port: MessagePort;
  process(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameters: Map<string, Float32Array>
  ): void;
}
declare function registerProcessor(
  name: string,
  processorCtor: (new (
    options?: AudioWorkletNodeOptions
  ) => AudioWorkletProcessor) & {
    parameterDescriptors?: any[];
  }
): void;

declare let AudioWorkletProcessor: {
  prototype: AudioWorkletProcessor;
  new (options?: AudioWorkletNodeOptions): AudioWorkletProcessor;
};

const SAMPLE_LOG_INTERVAL = 5000;

function totalSignal(buffer: Float32Array): number {
  let sum = 0;
  for (const value of buffer.values()) {
    sum += Math.abs(value);
  }
  return sum;
}

class NoiseSuppressionWorker extends AudioWorkletProcessor {
  private dtln_handle: DtlnPluginOpaqueHandle | undefined;
  private input_index = 0;
  private input_buffer: Float32Array = new Float32Array(DTLN_FIXED_BUFFER_SIZE);
  private output_bytes = 0;
  private output_buffer: Float32Array = new Float32Array(
    DTLN_FIXED_BUFFER_SIZE
  );

  private last_log_time = Date.now();
  private avg_samples_processed = 0;
  private avg_input_signal = 0;
  private avg_output_signal = 0;
  private avg_signal_enhancement = 0;
  private avg_signal_suppression = 0;

  constructor() {
    super();
  }
  process(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    _parameters: Map<string, Float32Array>
  ): boolean {
    if (this.last_log_time + SAMPLE_LOG_INTERVAL < Date.now()) {
      const metrics: NoiseSuppressionMetrics = {
        avg_samples_processed:
          this.avg_samples_processed / (SAMPLE_LOG_INTERVAL / 1000.0),
        avg_input_signal:
          this.avg_input_signal / (SAMPLE_LOG_INTERVAL / 1000.0),
        avg_output_signal:
          this.avg_output_signal / (SAMPLE_LOG_INTERVAL / 1000.0),
        avg_signal_enhancement:
          this.avg_signal_enhancement / (SAMPLE_LOG_INTERVAL / 1000.0),
        avg_signal_suppression:
          this.avg_signal_suppression / (SAMPLE_LOG_INTERVAL / 1000.0),
      };
      this.port.postMessage(metrics);
      this.last_log_time = Date.now();
      this.avg_samples_processed = 0;
      this.avg_input_signal = 0;
      this.avg_output_signal = 0;
      this.avg_signal_suppression = 0;
      this.avg_signal_enhancement = 0;
    }

    if (!this.dtln_handle) {
      this.dtln_handle = dtln.dtln_create();
    }
    const input = inputs[0][0];
    const output = outputs[0][0];

    this.input_buffer.set(input, this.input_index);
    this.input_index += input.length;
    if (this.input_index >= DTLN_FIXED_BUFFER_SIZE) {
      dtln.dtln_denoise(
        this.dtln_handle,
        this.input_buffer,
        this.output_buffer
      );
      this.input_index = 0;
      this.output_bytes = DTLN_FIXED_BUFFER_SIZE;

      // Metrics calculation
      const input_signal = totalSignal(this.input_buffer);
      const output_signal = totalSignal(this.output_buffer);
      const signal_difference = output_signal - input_signal;
      this.avg_input_signal += input_signal;
      this.avg_output_signal += output_signal;
      if (signal_difference >= 0) {
        this.avg_signal_enhancement += signal_difference;
      } else {
        this.avg_signal_suppression += Math.abs(signal_difference); // Have a positive value, easier to read the metric
      }
      this.avg_samples_processed += this.output_bytes;
    }
    if (this.output_bytes > 0) {
      output.set(this.output_buffer.subarray(0, input.length));
      // Shift the remaining bytes to the beginning of the buffer
      this.output_buffer.copyWithin(0, input.length);
      this.output_bytes -= input.length;

      if (this.output_bytes < 0) {
        this.output_bytes = 0;
      }
    } else {
      // Play silence until we hit DTLN_FIXED_BUFFER_SIZE samples.
      output.set(new Float32Array(input.length));
    }

    return true;
  }
}

registerProcessor("NoiseSuppressionWorker", NoiseSuppressionWorker);
