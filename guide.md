# Streaming Listener を動かしても良いという方へ

## 導入

https://github.com/tateisu/mastodon-streaming-listener 

を設定/インストールし終わったら以下の情報を(DMで)教えてください。
- 中継できる instance のURL 
- listenerのAPI endpoint url ( register,unregister の二つ)
- jp.juggler.subwaytooter 用のapp secret (ランダムに生成しちゃってください)

お知らせいただけましたら、こちらではアプリサーバに以下のような設定を行います

https://gist.github.com/tateisu/21438a22db9a3f6d77f91160d3e94953

## ネガティブキャッシュが消えるまで待機
- Subway Tooter v0.6.8 ではアプリを再起動したらすぐに通知の要求がアプリサーバ経由でListenerサーバに送られます
- Subway Tooter v0.6.9 以降ではアプリ上のネガティブキャッシュが消えるまで最大3時間かかるので、それが過ぎるまでお待ちください

## 動作確認

動作確認手順はこんな感じです。

- アプリを再起動する
- ホーム画面にするか、画面OFFにする
- 別の端末と別のアカウントを使って、何かアプリ上のアカウントに通知されるようなことをする
- 割とすぐに通知が発生したらリアルタイム通知は動作しています

よろしければListenerサーバのログも確認いただけると問題追跡がしやすいと思います。

