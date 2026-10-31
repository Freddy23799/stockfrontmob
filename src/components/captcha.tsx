import { useEffect, useMemo, useRef } from 'react';
import { View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import { CAPTCHA_ORIGIN } from '@/lib/captcha';

type Props = { siteKey: string; onToken: (token: string | null) => void; resetKey?: number };

/**
 * Captcha Cloudflare Turnstile dans une petite vue web. Un jeton ne sert qu'UNE fois : changer `resetKey` apres chaque envoi pour en obtenir un
 * nouveau (la vue est alors rechargee).
 */
export default function Captcha({ siteKey, onToken, resetKey = 0 }: Props) {
  const ref = useRef(onToken);
  useEffect(() => { ref.current = onToken; });
  const html = useMemo(() => `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<style>html,body{margin:0;background:transparent;display:flex;justify-content:center;align-items:center;min-height:70px}</style>
<script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" async defer></script></head>
<body><div id="w"></div><script>
function send(m){window.ReactNativeWebView.postMessage(JSON.stringify(m));}
function init(){
  if(!window.turnstile){setTimeout(init,150);return;}
  window.turnstile.render('#w',{sitekey:${JSON.stringify(siteKey)},theme:'auto',
    callback:function(t){send({token:t});},
    'expired-callback':function(){send({token:null});},
    'error-callback':function(){send({token:null,error:true});}});
}
init();
</script></body></html>`, [siteKey]);

  function onMessage(e: WebViewMessageEvent) {
    try {
      const data = JSON.parse(e.nativeEvent.data) as { token?: string | null };
      ref.current(data.token ?? null);
    } catch {
      ref.current(null);
    }
  }

  return (
    <View style={{ height: 78, width: '100%', alignItems: 'center' }}>
      <WebView key={resetKey} originWhitelist={['*']} source={{ html, baseUrl: CAPTCHA_ORIGIN }} onMessage={onMessage} javaScriptEnabled
        scrollEnabled={false} style={{ width: 320, backgroundColor: 'transparent' }} androidLayerType="hardware" />
    </View>
  );
}
