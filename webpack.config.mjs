import { merge } from 'webpack-merge';
import CopyWebpackPlugin from 'copy-webpack-plugin';

const common = {
  mode: process.env.NODE_ENV ?? "development",

  resolveLoader: {
    modules: ["node_modules"],
  },

  resolve: {
    extensions: [".ts", ".js"],
  },

  plugins: [
    new CopyWebpackPlugin({
      patterns: [
        {
          from: "./index.html",
          to: "./",
        },
      ],
    }),
  ],

  module: {
    rules: [
      {
        test: /\.ts$/,
        use: ["swc-loader"],
        exclude: [/node_modules/, /dist/],
      },
    ],
  },
};

const appBundle = merge(common, {
  target: 'web',
  entry: "./src/app.js",
  output: {
    filename: "app.js",
  },
});

const audioWorklet = merge(common, {
  target: "webworker",
  entry: "./src/audio-worklet/main.ts",
  output: {
    filename: "audio-worklet.js",
  },
});

export default [
  appBundle,
  audioWorklet,
];
