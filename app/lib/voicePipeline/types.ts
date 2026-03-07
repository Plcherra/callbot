export type VoicePipelineConfig = {
  deepgramApiKey: string;
  grokApiKey: string;
  elevenlabsApiKey: string;
  elevenlabsVoiceId: string;
  systemPrompt: string;
  greeting?: string;
  receptionistId?: string;
  voiceServerApiKey?: string;
  voiceServerBaseUrl?: string;
};

export type VoicePipelineCallbacks = {
  onTranscript?: (text: string, isFinal: boolean) => void;
  onResponse?: (text: string) => void;
  onAudio?: (buffer: ArrayBuffer) => void;
  onError?: (err: Error) => void;
};
