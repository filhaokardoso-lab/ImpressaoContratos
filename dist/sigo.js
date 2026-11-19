let sigoPessoaFisica = true;
let sigoPfDraft = {};
let sigoUrl;
let sigoFilename;

function sigoSelector(pf) {
  return '<fieldset><legend>Modelo do empreiteiro</legend><label>Tipo de cadastro<select id="sigo-kind">' +
    '<option value="pf" '+(pf?'selected':'')+'>Pessoa física · impressão original SIGO</option>' +
    '<option value="pj" '+(!pf?'selected':'')+'>Pessoa jurídica · referência da ficha de pintura</option></select></label></fieldset>';
}

function bindSigoSelector() {
  $('#sigo-kind').onchange = e => {
    if (sigoPessoaFisica) sigoPfDraft = Object.fromEntries(new FormData($('#form')));
    else remember();
    sigoPessoaFisica = e.target.value === 'pf';
    build();
  };
}

function buildSigoPF() {
  $('#heading').textContent = 'Serviço · padrão SIGO';
  $('#form').innerHTML = sigoSelector(true) +
    group('Dados da obra', ['obra|Código da obra','registro|Número do registro','status|Status|text|Em Andamento','inicio|Início|date','fim|Fim|date','?endobra|Endereço da obra','local|Cidade e estado','?padrao|Padrão','?tipoobra|Tipo de obra','?cei|CEI','?carta|Carta convite']) +
    group('Dados do empreiteiro', ['nome|Nome completo','cpf|CPF','?end|Endereço','?cidade|Cidade e estado']) +
    group('Observação', ['observacao|Escopo, forma de pagamento e chave Pix, conforme a contratação|area']) +
    group('Resumo financeiro', ['desconto|Desconto do SIGO (R$)|number','rodape|Total do SIGO, com sinal (ex.: -7.500,00)']) +
    group('Assinaturas e emissão', ['bj|Responsável pela BJ','bjqual|Cargo do responsável pela BJ','cargo|Função do empreiteiro|text|EMPREITEIRO -','autor|Emitido por']) +
    '<p role="alert" class="msg"></p><div class="actions"><button type="button" class="btn minor" id="change">Escolher outro modelo</button><button class="btn" id="review-pf">Conferir documento →</button></div>';
  for (const el of $('#form').elements) {
    if (el.name) el.value = sigoPfDraft[el.name] ?? ({status:'Em Andamento',cargo:'EMPREITEIRO -',desconto:'0'}[el.name] || '');
  }
  $('#form').elements.observacao.rows = 12;
  $('#form').elements.observacao.placeholder = 'ESCOPO:\n\nDescreva os serviços, um por linha.\n\nFORMA DE PAGAMENTO: …\n\nCHAVE PIX: …';
  bindSigoSelector();
  $('#change').onclick = () => {
    sigoPfDraft = Object.fromEntries(new FormData($('#form')));
    step(0);
  };
}

function setPdfReview(nativePdf) {
  $('#review .note').textContent = nativePdf ? 'Confira a ficha abaixo. Exportar PDF baixa uma cópia deste mesmo documento.' :
    'Na janela de impressão, selecione “Salvar como PDF” e desative os cabeçalhos e rodapés do navegador.';
  $('.preview').style.padding = nativePdf ? '0' : '';
}

function downloadSigo() {
  const link = document.createElement('a');
  link.href = sigoUrl;
  link.download = sigoFilename;
  link.click();
}

async function reviewSigo() {
  const form = $('#form');
  const data = Object.fromEntries(new FormData(form));
  const message = form.querySelector('.msg');
  const button = $('#review-pf');
  message.textContent = '';
  if (data.fim < data.inicio) { message.textContent = 'Confira as datas de início e término.'; return; }
  if (!/^\d{11}$/.test(data.cpf.replace(/[.\s-]/g,''))) { message.textContent = 'Informe os 11 dígitos do CPF.'; return; }
  if (!/^-?(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,2})?$/.test(data.rodape.trim())) { message.textContent = 'Use o formato -7.500,00 ou 7500,00 no total.'; return; }
  button.disabled = true;
  try {
    const bytes = await makeSigoPdf(data);
    if (!button.isConnected || !sigoPessoaFisica || $('#edit').hidden) return;
    if (sigoUrl) URL.revokeObjectURL(sigoUrl);
    sigoUrl = URL.createObjectURL(new Blob([bytes], {type:'application/pdf'}));
    sigoFilename = 'SIGO-' + data.obra.replace(/[^\p{L}\d_-]+/gu,'-') + '.pdf';
    const frame = document.createElement('iframe');
    frame.title = 'Ficha SIGO preenchida em PDF';
    frame.src = sigoUrl + '#toolbar=0';
    frame.style.cssText = 'display:block;width:100%;height:76vh;border:0';
    $('.preview').replaceChildren(frame);
    $('#print').replaceChildren();
    setPdfReview(true);
    step(2);
  } catch (error) {
    message.textContent = error.message || 'Falha ao preparar o PDF. Tente novamente.';
  } finally {
    button.disabled = false;
  }
}

async function readSigoAsset(path, format) {
  const response = await fetch(path);
  if (!response.ok) throw new Error('Falha ao carregar o modelo SIGO. Atualize a página e tente novamente.');
  return response[format]();
}

async function makeSigoPdf(data) {
  const [template, map] = await Promise.all([
    readSigoAsset('sigo-base.pdf', 'arrayBuffer'), readSigoAsset('sigo-fields.json', 'json')
  ]);
  const pdf = await PDFLib.PDFDocument.load(template);
  const page = pdf.getPages()[0];
  const stamp = new Intl.DateTimeFormat('pt-BR', {timeZone:'America/Sao_Paulo', dateStyle:'short', timeStyle:'medium'}).format(new Date()).replace(',', '');
  const amount = value => Number(value).toLocaleString('pt-BR', {minimumFractionDigits:2, maximumFractionDigits:2});
  const values = {...data, inicio:date(data.inicio), fim:date(data.fim), obraResumo:data.obra,
    rep:data.nome, desconto:amount(data.desconto), rodape:amount(data.rodape.trim().replace(/\./g,'').replace(',','.')),
    emissao:data.emissao || 'Este documento foi gerado às : '+stamp+' por '+data.autor};
  const fallback = {};
  for (const style of ['regular','bold']) {
    const standard = await pdf.embedFont(style==='bold' ? PDFLib.StandardFonts.HelveticaBold : PDFLib.StandardFonts.Helvetica);
    const name = 'Supl'+style;
    page.node.setFontDictionary(PDFLib.PDFName.of(name), standard.ref);
    fallback[style] = {standard,name};
  }
  function glyphs(text,spec) {
    const face = map.fonts[spec.font];
    return Array.from(text.normalize('NFC'), c => {
      const g = face.characters[c];
      if (g) return {font:face.resource, hex:g[0].toString(16).padStart(4,'0'), width:g[1]*spec.size/1000};
      const {standard,name} = fallback[spec.font];
      try {return {font:name, hex:standard.encodeText(c).asString(), width:standard.widthOfTextAtSize(c,spec.size)};}
      catch {throw new Error('O caractere “'+c+'” não está disponível nas fontes desta ficha.');}
    });
  }
  function width(text,spec){return glyphs(text,spec).reduce((n,g)=>n+g.width,0);}
  function draw(text, spec, y, key) {
    if (!text) return;
    const chars=glyphs(text,spec);
    const total=chars.reduce((n,g)=>n+g.width,0);
    if(total>spec.width+0.3) {
      const field=$('#form').elements.namedItem(({obraResumo:'obra',rep:'nome',emissao:'autor'})[key] || key);
      const label=field?.closest('label')?.textContent || key;
      throw new Error('O texto em “'+label+'” ultrapassa o espaço da ficha. Abrevie para preservar o layout.');
    }
    const x=spec.align==='center'?spec.x-total/2:spec.x;
    const ops=[PDFLib.pushGraphicsState(), PDFLib.setFillingRgbColor(...spec.color), PDFLib.beginText(), PDFLib.setTextMatrix(1,0,key==='emissao'?0.3:0,1,x,y)];
    let previous='';
    for (const g of chars) {
      if(g.font!==previous){ops.push(PDFLib.setFontAndSize(g.font,spec.size));previous=g.font;}
      ops.push(PDFLib.showText(PDFLib.PDFHexString.of(g.hex)));
    }
    page.pushOperators(...ops,PDFLib.endText(),PDFLib.popGraphicsState());
  }
  for (const [key,spec] of Object.entries(map.fields)) {
    const text=String(values[key]??'').trim();
    if(key!=='observacao'){draw(text,spec,spec.y,key);continue;}
    let y=spec.y;
    const line=t=>{
      if(y<spec.minY-0.1) throw new Error('A observação ultrapassa a área de uma página deste modelo SIGO. Reduza o texto ou as linhas em branco.');
      draw(t,spec,y,key);y-=spec.lineHeight;
    };
    for(const paragraph of text.split(/\r?\n/)) {
      if(!paragraph.trim()){y-=spec.paragraphGap;continue;}
      let current='';
      for(const word of paragraph.trim().split(/\s+/)){
        const next=current?current+' '+word:word;
        if(current && width(next,spec)>spec.width){line(current);current=word;}
        else current=next;
      }
      line(current);
    }
  }
  pdf.setTitle('Contrato de serviço SIGO · '+data.obra);
  return pdf.save();
}
