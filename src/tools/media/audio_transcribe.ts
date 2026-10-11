import { defineTool } from '../../core/tool.js';
import { runMediaTool } from '../../core/media-tools.js';

/**
 * pro_fetch_audio_transcribe — Transcribe audio to text via a Whisper-compatible API
 * Pack: media (pro-fetch)
 */
export default defineTool({
  name: 'pro_fetch_audio_transcribe',
  description: 'Transcribe audio to text via a Whisper-compatible API',
  category: 'media',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'Manzil (URL)' },
    },
    required: ['url'],
  },
  async handler(input) {
    return runMediaTool('pro_fetch_audio_transcribe', input);
  },
});
