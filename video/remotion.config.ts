import {Config} from '@remotion/cli/config';
import path from 'node:path';

Config.setPublicDir(path.resolve('..', 'assets'));
Config.setVideoImageFormat('jpeg');
Config.setOverwriteOutput(true);
// ThreeCanvas needs a GPU-backed WebGL context in headless Chrome.
Config.setChromiumOpenGlRenderer('angle');
Config.setCodec('h264');
Config.setCrf(16);
