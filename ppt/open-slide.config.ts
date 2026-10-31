import type {OpenSlideConfig} from '@open-slide/core';

export default {
  port: 5180,
  assetsDir: '../assets',
  slidesDir: 'slides',
  agent: {enabled: false},
} satisfies OpenSlideConfig;
