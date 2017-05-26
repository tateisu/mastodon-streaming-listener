# 自分で Streaming Listener を建てて、どのタンスでもSubway Tooter のリアルタイム通知を使えるようにする方法

## 必要なもの
- Subway Tooter 0.7.2 以降
- mastodon-streaming-listener master ブランチの v0.0.3 以降

## 特別なアプリIDとSecretを考える
Streaming Listenerがあなたを識別できるように、特別なアプリIDとSecretの組み合わせを生成してください
以下の説明では SPECIAL_APP_ID, SPECIAL_APP_SECRET と表記しますので、適時置き換えてください。

## Streaming Listener の設定変更

### config/app_map.hjson

Streaming Listenerが接続を許可するアプリのID,Secretの組み合わせを列挙する設定ファイルです

```
{
    // app id
    "jp.juggler.subwaytooter": {
        // app secret that is required to make listener.
        secret: "*******"
    }

    "SPECIAL_APP_ID": {
        secret: "SPECIAL_APP_SECRET"
    }
}
```
### config/instance_map.hjson

Streaming Listener が接続しに行くインスタンスを列挙する設定ファイルです

```
{
    // Hjson format is extended JSON.
    // - You can write comment in this file.
    // - commas are optionnal.

    // makes entries for each instance that is allowed to listen.
    // please use only lower-case in instance URL.
    // インスタンスのURLは小文字で、ホスト名末尾の / を書かない

    // 今回の設定には関係ありません
    // タンス管理者さんではないのなら、このブロック丸ごとコメントアウトしても問題ありません
    // "https://your-instance": {
    //     // (optional) replace url to connect.
    //     replaceUrl: "http://172.17.0.1:4000" 
    // }

    // if you want don't limit instance to listen, uncomment this.
    "*" :{
        appIdAllowed : [ "SPECIAL_APP_ID" ]
    }
}
```
ワイルドカード的な "*" インスタンス指定に対して、 特別なアプリID,Secretを知っている人にだけ中継を許可します。

### 設定変更が終わったらStream Listenerを再起動して、ログに妙なエラーがないか確認しておきましょう

## 通知リスナ設定ファイルの作成

以下のようなファイルを作成して、Webから見える場所に設置します。設置したらURLをメモしておいてください(B)

```
{
    "*": {
        urlStreamingListenerRegister: "https://your-stream-listener-api-end-point/register"
        urlStreamingListenerUnregister: "https://your-stream-listener-api-end-point/unregister"
        appId: "SPECIAL_APP_ID"
    }
}
```

## アプリへの設定

- Subway Tooter のアプリ設定を開きます。
- 「カスタム通知リスナ」「編集」を開きます。
- 「設定情報URL」 に (B) のURLを入力します。
- 「シークレット」に SPECIAL_APP_SECRET を入力します。
- 画面下の「テスト」ボタンを押して、通知リスナ設定ファイルに問題がないか確認します。
- 大丈夫そうなら「保存」を押して画面を閉じます。

## 動作確認

設定は以上です。
これであなたのStreaming Listenerから任意のタンスの通知を受信してアプリサーバとFCM経由でリアルタイム通知できるようになります。
画面を閉じた状態で別端末、別アカウントを使って、何か元のアカウントに通知されるようなことを試してみてください。

うまく行かない場合、 Android 側は adb logcat のログ や Streaming Listenerの ログを確認するとよいでしょう。
