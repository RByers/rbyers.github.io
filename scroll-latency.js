
<!DOCTYPE html>


<html xmlns="http://www.w3.org/1999/xhtml" lang="ja">
  <head>
    <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
    <title>マルチシグスキーマ &#8212; Symbol Documentation</title>
    <link rel="stylesheet" href="../_static/bootstrap-sphinx.css" type="text/css" />
    <link rel="stylesheet" href="../_static/pygments.css" type="text/css" />
    <link rel="stylesheet" href="https://fonts.googleapis.com/css?family=Noto+Sans:400,400i,700&display=swap" type="text/css" />
    <link rel="stylesheet" href="https://use.fontawesome.com/releases/v5.2.0/css/all.css" type="text/css" />
    <link rel="stylesheet" href="../_static/css/custom.css" type="text/css" />
    <link rel="stylesheet" href="../_static/examplecode.css" type="text/css" />
    <script type="text/javascript">
      var DOCUMENTATION_OPTIONS = {
        URL_ROOT:    '../',
        VERSION:     'Main',
        COLLAPSE_INDEX: false,
        FILE_SUFFIX: '.html',
        HAS_SOURCE:  true,
        SOURCELINK_SUFFIX: '.txt'
      };
    </script>
    <script type="text/javascript" src="../_static/jquery.js"></script>
    <script type="text/javascript" src="../_static/underscore.js"></script>
    <script type="text/javascript" src="../_static/doctools.js"></script>
    <script type="text/javascript" src="../_static/js/custom.js"></script>
    <script type="text/javascript" src="../_static/translations.js"></script>
    <script type="text/javascript" src="https://cdnjs.cloudflare.com/ajax/libs/mathjax/2.7.1/MathJax.js?config=TeX-AMS-MML_HTMLorMML"></script>
    <script type="text/javascript" src="../_static/examplecode.js"></script>
    <script type="text/javascript" src="https://unpkg.com/mermaid@7.1.0/dist/mermaid.min.js"></script>
    <script type="text/javascript" src="../_static/js/jquery-1.11.0.min.js"></script>
    <script type="text/javascript" src="../_static/js/jquery-fix.js"></script>
    <script type="text/javascript" src="../_static/bootstrap-3.3.7/js/bootstrap.min.js"></script>
    <script type="text/javascript" src="../_static/bootstrap-sphinx.js"></script>
    <link rel="shortcut icon" href="../_static/favicon.ico"/>
    <link rel="index" title="索引" href="../genindex.html" />
    <link rel="search" title="検索" href="../search.html" />
    <link rel="next" title="ネームスペーススキーマ" href="namespace.html" />
    <link rel="prev" title="モザイクスキーマ" href="mosaic.html" />
  
<meta charset='utf-8'>
<meta http-equiv='X-UA-Compatible' content='IE=edge,chrome=1'>
<meta name='viewport' content='width=device-width, initial-scale=1.0, maximum-scale=5'>
<meta name="apple-mobile-web-app-capable" content="yes">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/docsearch.js@2/dist/cdn/docsearch.min.css"/>
<script type="text/javascript">
    var _paq = window._paq || [];
    _paq.push(['disableCookies']);
    _paq.push(['trackPageView']);
    _paq.push(['enableLinkTracking']);
    (function() {
        var u="https://nemtech.matomo.cloud/";
        _paq.push(['setTrackerUrl', u+'matomo.php']);
        _paq.push(['setSiteId', '1']);
        var d=document, g=d.createElement('script'), s=d.getElementsByTagName('script')[0];
        g.type='text/javascript'; g.async=true; g.defer=true; g.src='//cdn.matomo.cloud/nemtech.matomo.cloud/matomo.js'; s.parentNode.insertBefore(g,s);
    })();
</script>

  
  <link rel="alternate" type="application/atom+xml"  href="../guides/atom.xml" title="Blog">
  
  
  <style type="text/css">
    ul.ablog-archive {list-style: none; overflow: auto; margin-left: 0px}
    ul.ablog-archive li {float: left; margin-right: 5px; font-size: 80%}
    ul.postlist a {font-style: italic;}
    ul.postlist-style-disc {list-style-type: disc;}
    ul.postlist-style-none {list-style-type: none;}
    ul.postlist-style-circle {list-style-type: circle;}
  </style>

  </head>
  <body>

<div class="navbar navbar-default gradient navbar-fixed-top"
     id="navbar">
    <div class="container navbar-top hidden-xs hidden-sm">
        <div class="row">
            <div class="col-lg-8 col-md-7">
                <div id="language">
    <label class="select">
        <select>
            <option id="english" value="en">EN</option>
            <option id="japanese" value="ja">JA</option>
            <!--<option id="chinese" value="zh_CN">中文</option>-->
            <option id="translate" value="translate">翻訳する</option>
        </select>
    </label>
</div>
            </div>
            <div class="col-lg-4 col-md-5">
                
                <div id="search-box">
    <input class="search search-desktop form-control" placeholder="Search"/>
</div>
                
                <ul id="social" class="list-inline">
    <li>
        <a href="https://twitter.com/NEMofficial" rel="nofollow"><i class="fab fa-twitter"></i></a>
    </li>
    <li>
        <a href="https://join.slack.com/t/nem2/shared_invite/zt-km50fzxd-I8dPNrPEV6cqYVrhyLvrfA"
           rel="nofollow"><i class="fab fa-slack"></i></a>
    </li>
    <li>
        <a href="https://github.com/nemtech/" rel="nofollow"><i class="fab fa-github"></i></a>
    </li>
</ul>
            </div>
        </div>
    </div>
    <hr/>
    <div class="container navbar-main">
        <div class="row">
            <div class="navbar-header col-lg-6 col-md-4 col-xs-6">
                <a class="navbar-brand" href="../index.html">
                    
                    <span><img alt="NEM logo" src="../_static/logo-symbol.svg"></span>
                    
                </a>
            </div>
            <div class="navbar-right col-lg-6 col-md-8 hidden-xs hidden-sm">
                <ul class="list-inline">
    <li>
        <a href="/ja/getting-started/what-is-symbol.html" class="">入門</a>
    </li>
    <li>
        <a href="/ja/concepts/overview.html" class="active">機能</a>
    </li>
    <li>
        <a href="/ja/guides/category.html" class="">ガイド</a>
    </li>
    <li>
        <a href="/ja/references/overview.html" class="">ツール</a>
    </li>
    <li>
        <a href="/ja/contribute/community.html" class="">ヘルプ</a>
    </li>
</ul>
            </div>
            <div class="navbar-right col-xs-6 hidden-lg hidden-md">
                
                <div id="search-box">
    <input class="search search-mobile form-control" placeholder="Search"/>
</div>
                

            </div>
        </div>
        <div class="row">
            <div class="col-md-12 sidebar-xs visible-xs visible-sm">
                <div class="dropdown">
                    <a href="#" class="dropdown-toggle" data-toggle="dropdown">ナビゲーション <b
                            class="caret"></b></a>
                    <ul class="dropdown-menu globaltoc"><ul class="current">
<li class="toctree-l1"><a class="reference internal" href="../getting-started/index.html">入門</a></li>
<li class="toctree-l1"><a class="reference internal" href="../guides/index.html">ガイド</a></li>
<li class="toctree-l1"><a class="reference internal" href="../concepts/overview.html">コンセプト</a></li>
<li class="toctree-l1 current"><a class="reference internal" href="../references/index.html">リファレンス</a><ul class="current">
<li class="toctree-l2"><a class="reference internal" href="../references/overview.html">ツール</a></li>
<li class="toctree-l2"><a class="reference internal" href="../server.html">サーバ</a></li>
<li class="toctree-l2"><a class="reference internal" href="../api.html">REST ゲートウェイ</a></li>
<li class="toctree-l2"><a class="reference internal" href="../sdk.html">SDK</a></li>
<li class="toctree-l2"><a class="reference internal" href="../cli.html">CLI</a></li>
<li class="toctree-l2"><a class="reference internal" href="../wallets.html">ウォレット</a></li>
<li class="toctree-l2"><a class="reference internal" href="../compatibility.html">互換性表</a></li>
<li class="toctree-l2 current"><a class="reference internal" href="index.html">トランザクションのシリアル化</a><ul class="current">
<li class="toctree-l3"><a class="reference internal" href="account_link.html">アカウントリンクアクションスキーマ</a></li>
<li class="toctree-l3"><a class="reference internal" href="aggregate.html">ハッシュロックスキーマ</a></li>
<li class="toctree-l3"><a class="reference internal" href="coresystem.html">コアシステムスキーマ</a></li>
<li class="toctree-l3"><a class="reference internal" href="entity.html">エンティティスキーマ</a></li>
<li class="toctree-l3"><a class="reference internal" href="lock_hash.html">ロックハッシュスキーマ</a></li>
<li class="toctree-l3"><a class="reference internal" href="lock_secret.html">ロックシークレットスキーマ</a></li>
<li class="toctree-l3"><a class="reference internal" href="metadata.html">メタデータスキーマ</a></li>
<li class="toctree-l3"><a class="reference internal" href="mosaic.html">モザイクスキーマ</a></li>
<li class="toctree-l3 current"><a class="current reference internal" href="#">マルチシグスキーマ</a></li>
<li class="toctree-l3"><a class="reference internal" href="namespace.html">ネームスペーススキーマ</a></li>
<li class="toctree-l3"><a class="reference internal" href="receipts.html">レシートスキーマ</a></li>
<li class="toctree-l3"><a class="reference internal" href="resolution_statement.html">解決ステートメントスキーマ</a></li>
<li class="toctree-l3"><a class="reference internal" href="restriction_account.html">アカウント制限スキーマ</a></li>
<li class="toctree-l3"><a class="reference internal" href="restriction_mosaic.html">モザイク制限スキーマ</a></li>
<li class="toctree-l3"><a class="reference internal" href="transaction.html">トランザクションスキーマ</a></li>
<li class="toctree-l3"><a class="reference internal" href="transfer.html">転送スキーマ</a></li>
</ul>
</li>
</ul>
</li>
<li class="toctree-l1"><a class="reference internal" href="../contribute/index.html">貢献</a></li>
</ul>
</ul>
                </div>
            </div>
        </div>
    </div>
</div>

<div class="container">
    <div class="row">
        
        

<div class="col-md-3">
    <div id="sidebar" class="bs-sidenav" role="complementary">
        
        <div class="sidebar-md hidden-xs hidden-sm">
    <h4>ナビゲーション</h4>
    <hr />
    <ul class="current">
<li class="toctree-l1"><a class="reference internal" href="../getting-started/index.html">入門</a></li>
<li class="toctree-l1"><a class="reference internal" href="../guides/index.html">ガイド</a></li>
<li class="toctree-l1"><a class="reference internal" href="../concepts/overview.html">コンセプト</a></li>
<li class="toctree-l1 current"><a class="reference internal" href="../references/index.html">リファレンス</a><ul class="current">
<li class="toctree-l2"><a class="reference internal" href="../references/overview.html">ツール</a></li>
<li class="toctree-l2"><a class="reference internal" href="../server.html">サーバ</a></li>
<li class="toctree-l2"><a class="reference internal" href="../api.html">REST ゲートウェイ</a></li>
<li class="toctree-l2"><a class="reference internal" href="../sdk.html">SDK</a></li>
<li class="toctree-l2"><a class="reference internal" href="../cli.html">CLI</a></li>
<li class="toctree-l2"><a class="reference internal" href="../wallets.html">ウォレット</a></li>
<li class="toctree-l2"><a class="reference internal" href="../compatibility.html">互換性表</a></li>
<li class="toctree-l2 current"><a class="reference internal" href="index.html">トランザクションのシリアル化</a><ul class="current">
<li class="toctree-l3"><a class="reference internal" href="account_link.html">アカウントリンクアクションスキーマ</a></li>
<li class="toctree-l3"><a class="reference internal" href="aggregate.html">ハッシュロックスキーマ</a></li>
<li class="toctree-l3"><a class="reference internal" href="coresystem.html">コアシステムスキーマ</a></li>
<li class="toctree-l3"><a class="reference internal" href="entity.html">エンティティスキーマ</a></li>
<li class="toctree-l3"><a class="reference internal" href="lock_hash.html">ロックハッシュスキーマ</a></li>
<li class="toctree-l3"><a class="reference internal" href="lock_secret.html">ロックシークレットスキーマ</a></li>
<li class="toctree-l3"><a class="reference internal" href="metadata.html">メタデータスキーマ</a></li>
<li class="toctree-l3"><a class="reference internal" href="mosaic.html">モザイクスキーマ</a></li>
<li class="toctree-l3 current"><a class="current reference internal" href="#">マルチシグスキーマ</a></li>
<li class="toctree-l3"><a class="reference internal" href="namespace.html">ネームスペーススキーマ</a></li>
<li class="toctree-l3"><a class="reference internal" href="receipts.html">レシートスキーマ</a></li>
<li class="toctree-l3"><a class="reference internal" href="resolution_statement.html">解決ステートメントスキーマ</a></li>
<li class="toctree-l3"><a class="reference internal" href="restriction_account.html">アカウント制限スキーマ</a></li>
<li class="toctree-l3"><a class="reference internal" href="restriction_mosaic.html">モザイク制限スキーマ</a></li>
<li class="toctree-l3"><a class="reference internal" href="transaction.html">トランザクションスキーマ</a></li>
<li class="toctree-l3"><a class="reference internal" href="transfer.html">転送スキーマ</a></li>
</ul>
</li>
</ul>
</li>
<li class="toctree-l1"><a class="reference internal" href="../contribute/index.html">貢献</a></li>
</ul>

    <p class="version">
        <small><b>Version:</b> <a href="https://github.com/nemtech/nem2-docs/releases">0.22.2</a></small>
    </p>
</div>
        
    </div>
</div>


        
        <div class="col-md-7 content">
            
  <div class="section" id="multisig-schemas">
<h1>マルチシグスキーマ<a class="headerlink" href="#multisig-schemas" title="このヘッドラインへのパーマリンク">¶</a></h1>
<div class="admonition note">
<p class="first admonition-title">注釈</p>
<p class="last"><a class="reference external" href="https://github.com/nemtech/catbuffer">catbuffer スキーマ</a> リポジトリはどのように各トランザクションタイプがシリアライズされるべきかを定義しています。 <a class="reference external" href="https://github.com/nemtech/catbuffer-generators">catbuffer-generators</a> プロジェクトと組み合わせると、開発者は特定のプログラミング言語用のビルダークラスを生成できます。</p>
</div>
<div class="section" id="multisig-account-modification">
<h2>マルチシグアカウント変更<a class="headerlink" href="#multisig-account-modification" title="このヘッドラインへのパーマリンク">¶</a></h2>
<div class="section" id="multisigaccountmodificationtransaction">
<span id="multisig-account-modification-transaction"></span><h3>MultisigAccountModificationTransaction<a class="headerlink" href="#multisigaccountmodificationtransaction" title="このヘッドラインへのパーマリンク">¶</a></h3>
<p>MultisigAccountModificationTransaction のアナウンス:</p>
<ol class="loweralpha simple">
<li>マルチシグアカウントへの変換</li>
<li>マルチシグアカウントの設定可能なプロパティを変更</li>
<li>マルチシグアカウントから連署者の追加または削除</li>
</ol>
<p><strong>Version</strong>: 0x01</p>
<p><strong>EntityType</strong>: 0x4155</p>
<p><strong>インライン</strong></p>
<ul class="simple">
<li><a class="reference internal" href="transaction.html#id1"><span class="std std-ref">Transaction</span></a> または <a class="reference internal" href="transaction.html#embedded-transaction"><span class="std std-ref">EmbeddedTransaction</span></a></li>
</ul>
<table border="1" class="docutils">
<colgroup>
<col width="33%" />
<col width="33%" />
<col width="33%" />
</colgroup>
<thead valign="bottom">
<tr class="row-odd"><th class="head">Property</th>
<th class="head">Type</th>
<th class="head">Description</th>
</tr>
</thead>
<tbody valign="top">
<tr class="row-even"><td>minRemovalDelta</td>
<td>int8</td>
<td>連署者を削除するために必要な署名の数。既存のマルチアカウントを変更している場合、最低限の連署者の相対的な変化を示します。</td>
</tr>
<tr class="row-odd"><td>minApprovalDelta</td>
<td>int8</td>
<td>トランザクションを承認するために必要な署名の数。既存のマルチアカウントを変更している場合、最低限の連署者の相対的な変化を示します。</td>
</tr>
<tr class="row-even"><td>addressAdditionsCount</td>
<td>uint8</td>
<td>連署者アドレス追加数</td>
</tr>
<tr class="row-odd"><td>addressDeletionsCount</td>
<td>uint8</td>
<td>連署者アドレス削除数</td>
</tr>
<tr class="row-even"><td>multisigAccountModificationTransactionBody_Reserved1</td>
<td>uint32</td>
<td>addressAdditions を 8 バイト境界に揃える予約パディング</td>
</tr>
<tr class="row-odd"><td>addressAdditions</td>
<td>array(<a class="reference external" href="https://github.com/nemtech/catbuffer/blob/main/schemas/types.cats">UnresolvedAddress</a>, addressAdditionsCount)</td>
<td>連署者アドレス追加数</td>
</tr>
<tr class="row-even"><td>addressDeletions</td>
<td>array(<a class="reference external" href="https://github.com/nemtech/catbuffer/blob/main/schemas/types.cats">UnresolvedAddress</a>, addressDeletionsCount)</td>
<td>連署者アドレス削除数</td>
</tr>
</tbody>
</table>
</div>
</div>
</div>

  <div class="section">
  
  
  </div>

            
            <p class="feedback">
                <b>お探しのものは見つかりましたか？</b>
                <a href="https://github.com/nemtech/symbol-docs/issues/new/choose" target="_blank">フィードバックをください。</a>
            </p>
            
        </div>
         

<div class="col-md-2">
    <div class="bs-sidenav secondary" role="complementary">
    
    <div class="edit-github">
    <a href="https://github.com/nemtech/symbol-docs/edit/main/source/serialization/multisig.rst" rel="nofollow"> <i class="fab fa-github"></i> このページを加筆修正する</a>
</div>
    <span class="title">このページ</span>
    <ul>
<li><a class="reference internal" href="#">マルチシグスキーマ</a><ul>
<li><a class="reference internal" href="#multisig-account-modification">マルチシグアカウント変更</a><ul>
<li><a class="reference internal" href="#multisigaccountmodificationtransaction">MultisigAccountModificationTransaction</a></li>
</ul>
</li>
</ul>
</li>
</ul>

    
    </div>
</div>

 
    </div>
</div>

<script type="text/javascript" src="https://cdn.jsdelivr.net/npm/docsearch.js@2/dist/cdn/docsearch.min.js"></script>
<script type="text/javascript">
    docsearch({
        apiKey: 'fea87a364e2d51e3729a3a4889f7fe61',
        indexName: 'nemtech',
        inputSelector: '.search-desktop',
        debug: false
    });

    docsearch({
        apiKey: 'fea87a364e2d51e3729a3a4889f7fe61',
        indexName: 'nemtech',
        inputSelector: '.search-mobile',
        debug: false
    });
</script>

  </body>
</html>
