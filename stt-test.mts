import { textToSpeech, speechToText, ensureCompatibleFormat } from '@workspace/integrations-openai-ai-server/audio';
try {
  const wav = await textToSpeech('Hello Sidekick, how many volunteering hours did I log this month?', 'alloy', 'wav');
  console.log('tts bytes:', wav.length);
  const { buffer, format } = await ensureCompatibleFormat(wav);
  console.log('format:', format, 'bytes:', buffer.length);
  const t = await speechToText(buffer, format);
  console.log('transcript:', JSON.stringify(t));
} catch (e: any) { console.log('ERROR:', e?.status, String(e?.message).slice(0,500)); }
