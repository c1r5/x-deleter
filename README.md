# x-deleter

Apaga os próprios tweets a partir do console de x.com, com a conta já aberta.

O plano está na issue #1. Quando isso virar extensão, este texto ganha o passo de instalar.

## Gerar o arquivo

Na pasta do repositório:

```
node scripts/build.mjs
```

O comando grava `x-deleter.js`. Não há dependência para instalar.

## Colar no X

Abra o seu perfil em x.com, logado. O nome da conta sai do endereço da página. O id sai do cookie `twid`.

Abra o console, cole o conteúdo de `x-deleter.js` e tecle Enter. O Chrome pede `allow pasting` antes de aceitar um colar grande. O painel ocupa a coluna da direita do X e acompanha a largura dela. Quando o X esconde essa coluna, o painel vai para o topo da coluna principal. As cores seguem o tema claro ou Lights out.

## Configurar as requisições

Sem transaction id no slot que for usado, o status fica `fail`, o log diz qual slot falta e nenhuma requisição sai.

A engrenagem abre Configurações Avançadas. No Chrome, na aba Rede, copie a requisição como fetch ou como cURL e cole na caixa. Analisar grava o slot quando reconhece o texto.

- Uma busca de respostas (`UserRepliesTimeline` ou `UserTweetsAndReplies`) vai para Buscar respostas.
- Uma busca `UserTweets` ou `UserOriginalsTimeline` vai para Buscar tweets antigos.
- Uma busca `UserRepostsTimeline` vai para Buscar reposts.
- Um `DeleteTweet` vai para Apagar tweet.

A caixa ao lado do nome marca o slot que já tem transaction id. O clique no nome abre esse slot para edição. Guardar grava. Restaurar devolve aquele slot ao padrão do repositório. Restaurar tudo devolve os quatro.

O cookie colado é descartado. O `x-csrf-token` enviado é o `ct0` da página na hora do envio.

Se um número longo estiver numa chave que não é `tweet_id`, `user_id` nem `cursor`, Analisar não grava. A tela manual abre com o valor ainda literal e a lista do que marcar. Os placeholders são `{{tweet_id}}`, `{{user_id}}` e `{{cursor}}`. Guardar recusa o corpo de apagar sem `{{tweet_id}}` e as variáveis de busca sem `{{user_id}}`.

A configuração fica no `localStorage` de x.com, na chave `x-deleter.config.v1`.

O transaction id expira. Quando o X recusa a chamada, o log mostra o status HTTP. Cole a requisição de novo.

## Configurações rápidas

Apagar usa o que está marcado nessa hora.

Do arquivo lê um `tweets.js` do export da conta, em vez da timeline. O botão Escolher aparece ao ligar a opção. Sem arquivo, o log diz `falta o tweets.js` e o status fica `fail`.

Desfazer retweets vem ligado. Na timeline, o retweet entra no lote. Desligado, o retweet fica. No `tweets.js`, ligado só entra texto que começa com `RT `. Desligado, só entra o resto. Resposta para a própria conta não entra no arquivo.

Manter o fixado vem ligado e tenta pular o tweet que a página marca como fixado. Essa detecção falha. Para garantir, ponha o id em Ignorar estes IDs.

Só com link limita o lote da timeline a tweets que têm URL.

Tweets antigos usa o slot Buscar tweets antigos. Sem um cURL de `UserTweets` ou `UserOriginalsTimeline` nesse slot, a busca continua no endpoint de respostas, com as variáveis de tweets antigos.

Reposts usa o slot Buscar reposts (`UserRepostsTimeline`). Ligado junto com Tweets antigos, a busca fica nesse slot. A primeira página sai sem cursor. As seguintes mandam o cursor da página anterior.

De e Até formam o intervalo, na meia-noite local, sem incluir o dia da borda. Um tweet anterior a De interrompe a paginação.

Palavras são separadas por vírgula. Qualquer uma basta. Campo vazio vale para todos os textos.

Ignorar estes IDs tira esses tweets do lote.

Apagar só estes IDs não percorre a timeline e apaga essa lista. Nesse modo, e também no arquivo, só o slot Apagar tweet precisa de transaction id. Na timeline, o slot de busca usado e o slot Apagar tweet precisam.

## O lote

Buscar muda o status para `buscando` e abre a lista no centro da tela. As linhas entram conforme a página chega, já marcadas. Fechar interrompe a busca. Essa ação não apaga. Sem transaction id no slot de busca, o modal não abre e o log diz qual slot falta. No fim da busca o status fica `done`.

Executar fica no canto inferior esquerdo do modal e só liga quando a busca termina. Ao lado estão Nuke, unretweet, delete posts e delete replies. As três últimas começam ligadas. Nuke começa desligado. Ligar Nuke desliga as outras. Ligar qualquer uma das outras desliga Nuke. Executar usa o slot Apagar tweet nas linhas marcadas, na ordem unretweet, delete replies, delete posts. Entre itens do mesmo tipo há 1 s. No 429 a espera começa em 1 minuto e dobra até 5 minutos. Outro erro HTTP espera 10 s vezes a tentativa, até 8 vezes. Entre tipos há 30 s, pulados quando o tipo seguinte não tem linha. O status da execução é `executando`, e no fim `done`. `fail` cobre slot sem transaction id, arquivo ausente, nada selecionado ou tentativas esgotadas.

O log dessas etapas leva emoji: 🔎 busca, ➕ linha, ▶️ ação, 💥 Nuke, ⏳ espera, ✅ item, ⚠️ nova tentativa, ❌ falha, 🏁 fim.

No status 429 o log avisa e a espera é de 1 minuto. Outro erro HTTP espera e tenta de novo.

O painel usa a coluna da direita do X. A largura muda com a janela, no mesmo ponto em que o X muda essa coluna.
