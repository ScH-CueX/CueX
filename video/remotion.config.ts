import {Config} from '@remotion/cli/config';

Config.setVideoImageFormat('jpeg');
Config.setOverwriteOutput(true);
// ThreeCanvas needs a GPU-backed WebGL context in headless Chrome.
Config.setChromiumOpenGlRenderer('angle');
Config.setCodec('h264');
Config.setCrf(16);
