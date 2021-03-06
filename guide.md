## 背景

Mastodonの通知をモバイルアプリにリアルタイムに転送するには以下のようなことを行います。

- (A) 常時接続可能な場所からMastodonのストリーミングAPIを受信して通知イベントがくるのを待つ
- (B) 通知イベントをFirebase Clound Messaging 経由でアプリに送る
- (C) アプリはメッセージイベントを受け取って通知を出す

Tusky アプリは (A)と(B)を一つのサーバで行った結果、通知が不安定になりました。

Pawoo アプリは自社インスタンスのみリアルタイム通知できるような実装を行いました。

Subway Tooter では(A)と(B)のサーバを分離することにしました。図にするとこんな感じです。

![slide1](https://cloud.githubusercontent.com/assets/333944/26376504/af071c76-4047-11e7-9308-2cd538be0439.jpg)

(A)を処理するサーバを Streaming Listener と読んでいます。図の赤い部分がそれです。

Streaming Listener をアプリサーバから分離する利点
- (1)(Tuskyと比較して)インスタンスのサーバの近く(LAN内部)でストリーミング受信を行うことで帯域負荷が下がる。安定性も増す。
- (2)インスタンスごとに受信サーバが分散するのでスケールしやすい
- (3)受信サーバにはアプリ固有の情報は含まれない。 (もし追従するアプリがあれば)1つの受信サーバで複数のアプリに対応できる可能性がある。
- (4)(Pawooと比較して)よりオープンな方式である

誰かが特定タンス向けのStreaming Listenerを設置してくれたら、SubwayTooter で そのタンスのリアルタイム通知が可能になります。

他力本願と思われるかもしれませんが、(1)の利点を活かすなら、タンス管理者に協力いただいてインスタンスのサーバと近い場所に Streaming Listener を設置するのが最も理に適っています。
タンス管理者じゃなくても受信サーバは建てられるのですが、(1)の利点はなくなります。
現時点ではStreaming API の userストリームにはホームと通知両方の情報が送られてきますが、ホームの情報は全部捨てるので帯域の無駄が出ます。

…もしMastodon自体に通知コールバックを登録する機能があればStreaming Listenerなんて不要になると思うんですが、現時点ではそういう機能は存在しなさそうです…

# Streaming Listener を動かしても良いという方へ

## 導入

https://github.com/tateisu/mastodon-streaming-listener 

の下の方にあるインストール手順をご覧ください。

## アプリサーバとの連携

以下の情報を(DMで)教えてください。
- 中継できる instance のURL 
- listenerのAPI endpoint url ( register,unregister の二つ)
- jp.juggler.subwaytooter 用のapp secret (ランダムに生成しちゃってください)

お知らせいただけましたら、こちらではアプリサーバに以下のような設定を行います

https://gist.github.com/tateisu/21438a22db9a3f6d77f91160d3e94953

## ネガティブキャッシュが消えるまで待機
- Subway Tooter v0.6.8 ではアプリを再起動したらすぐに通知の要求がアプリサーバ経由でListenerサーバに送られます
- Subway Tooter v0.6.9 以降ではアプリ上のネガティブキャッシュが消えるまで最大3時間かかるので、それが過ぎるまでお待ちください

テスト用の端末でアプリデータを消去してアカウントを追加しなおすのが一番待たなくて済むと思います…

## 動作確認

動作確認手順はこんな感じです。

- アプリを再起動する
- (端末の)ホーム画面にするか、画面OFFにする
- 別の端末と別のアカウントを使って、何かアプリ上のアカウントに通知されるようなことをする
- 割とすぐに通知が発生したらリアルタイム通知は動作しています

よろしければListenerサーバのログも確認いただけると問題追跡がしやすいと思います。

# 他アプリの開発者様へ

Streaming Listener も アプリサーバも API仕様と実装を公開しています。
- https://github.com/tateisu/mastodon-streaming-listener 
- https://github.com/tateisu/mastodon-fcm-sender

Streaming Listener には複数アプリに対応できる設定があります。
Streaming Listener サーバの管理者と協調してアプリIDとSecretの設定を行うと、それらのタンスでのリアルタイム通知を比較的容易に行えるようになります。

ライセンスはフォーク元のTusky-API に合わせてMITです。
