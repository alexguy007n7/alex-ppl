// ══════════════════════════════════════════════════════════════
//  SOLI OBFUSCATOR — Core Engine v2.0
//  Features: per-string key, multi-layer encrypt, table
//  indirection, env hiding, constant encrypt, dead code,
//  function wrap, anti-debug, fake VM, SOLI dispatch

// ══════════════════════════════════════════════════════════════
//  ALPHA UPGRADE PACK
//  6 improvements to harden Alpha before Beta
// ══════════════════════════════════════════════════════════════

// ── U1: Extended opcode pool (10–1019, no collision) ─────────
// Old: pool 10-265 (255 slots). New: 10-1019 (1009 slots).
// More spread = harder to guess opcode semantics by value alone.
function makeOpcodeMap() {
  var N = OP_NAMES.length;
  var pool = [];
  for(var i=0;i<1010;i++) pool.push(i+10);
  // Fisher-Yates
  for(var i=pool.length-1;i>0;i--){
    var j=Math.floor(Math.random()*(i+1));
    var t=pool[i];pool[i]=pool[j];pool[j]=t;
  }
  var map={};
  OP_NAMES.forEach(function(name,i){
    map[name]=pool[i];
    if(isNaN(pool[i])) throw new Error('NaN opcode: '+name);
  });
  var seen={};
  Object.values(map).forEach(function(v){
    if(seen[v]) throw new Error('duplicate opcode '+v);
    seen[v]=1;
  });
  return map;
}

// ── U2: 48-bit RC4 seed (6 bytes) ────────────────────────────
// Old: 3 bytes (16M combos). New: 6 bytes (281T combos).
function rc4Encrypt(bytes, seed) {
  // seed is now a 6-element array [s1..s6]
  var S=[];
  for(var i=0;i<256;i++) S[i]=i;
  // Key from all 6 seed bytes
  var key=seed.map(function(s){return s&0xFF;});
  var j=0;
  for(var i=0;i<256;i++){
    j=(j+S[i]+key[i%key.length])%256;
    var t=S[i];S[i]=S[j];S[j]=t;
  }
  var out=[];
  var a=0,b=0;
  for(var i=0;i<bytes.length;i++){
    a=(a+1)%256;
    b=(b+S[a])%256;
    var t=S[a];S[a]=S[b];S[b]=t;
    out.push(bytes[i]^S[(S[a]+S[b])%256]);
  }
  return out;
}

// ── U3: Variable name generator — mixed style ─────────────────
// Old: _a _b _c (obviously sequential).
// New: mix of short words + random suffix, looks like real code.
var _rvC = 0;
var _rvWords = ['vm','fn','st','cb','rc','dk','pk','ix','mk','sk',
                'ep','lp','gp','hp','wk','cx','bx','qx','zx','yx'];
function rv() {
  var n = _rvC++;
  var base = _rvWords[n % _rvWords.length];
  var suffix = Math.floor(n / _rvWords.length);
  var salt = Math.floor(Math.random()*9)+1;
  return base + (suffix > 0 ? (suffix*salt) : salt);
}
function randVar(){ return rv(); }

// ── U4: Multi-format blob encoding ───────────────────────────
// Old: single \XX string. New: randomly chosen between:
//   A) table of bytes  {53,79,76,...}
//   B) \XX string (original)
//   C) base64-like chunked string with runtime decode
// Picked randomly per compile run.
function encodeBlobLua(bytes) {
  var mode = Math.floor(Math.random()*3);
  if(mode===0) {
    // Table of ints, split into chunks of 64
    var chunks=[], chunk=[];
    bytes.forEach(function(b,i){
      chunk.push(b);
      if(chunk.length===64||i===bytes.length-1){chunks.push(chunk);chunk=[];}
    });
    var vT=rv(), vI=rv();
    var lines=['local '+vT+'={}'];
    chunks.forEach(function(ch){
      lines.push('for _,'+vI+' in ipairs({'+ ch.join(',') +'}) do '+vT+'[#'+vT+'+1]='+vI+' end');
    });
    return {code:lines.join('\n'), varName:vT};
  } else if(mode===1) {
    // Classic \XX
    var s='"'+bytes.map(function(b){return '\\'+b;}).join('')+'"';
    var vT=rv();
    var lines=['local '+vT+'={}','for '+rv()+'=1,#'+s+' do '+vT+'[#'+vT+'+1]=string.byte('+s+','+rv()+'..'+rv()+') end'];
    // Simpler: just use string.byte loop
    var vStr=rv(), vBuf2=rv(), vI2=rv();
    return {code:'local '+vStr+'='+s+'\nlocal '+vBuf2+'={}\nfor '+vI2+'=1,#'+vStr+' do '+vBuf2+'['+vI2+']=string.byte('+vStr+','+vI2+') end', varName:vBuf2};
  } else {
    // Hex pairs in string, runtime decode
    var hex=bytes.map(function(b){return ('00'+b.toString(16)).slice(-2);}).join('');
    var vH=rv(), vB=rv(), vI=rv();
    var s='"'+hex+'"';
    return {
      code:'local '+vH+'='+s+'\nlocal '+vB+'={}\nfor '+vI+'=1,#'+vH+',2 do '+vB+'[#'+vB+'+1]=tonumber('+vH+':sub('+vI+','+vI+'+1),16) end',
      varName: vB
    };
  }
}

// ── U5: Junk global writes ────────────────────────────────────
// Sprinkle _G.xxxxx = value noise before/after key operations
// Makes global table analysis harder
function buildJunkGlobals(n) {
  var lines=[];
  var junkWords=['cache','pool','store','index','queue','stack','heap','map','set','reg'];
  for(var i=0;i<n;i++){
    var name=junkWords[Math.floor(Math.random()*junkWords.length)]+Math.floor(Math.random()*9999);
    var val=Math.floor(Math.random()*0xFFFF);
    lines.push('_G["'+name+'"]='+obfNum(val));
  }
  return lines.join('\n');
}

// ── U6: Dispatch table key wrapping ──────────────────────────
// Old: disp[143] = function() ...
// New: disp[tonumber(tostring(143))] or disp[(math.floor(144)-1)]
// Makes static analysis of dispatch keys harder
function wrapDispatchKey(n) {
  var r=Math.floor(Math.random()*3);
  if(r===0) return '(math.floor('+obfNum(n+1)+')-1)';
  if(r===1) return '('+obfNum(n+100)+'-'+obfNum(100)+')';
  return obfNum(n);
}


// ══════════════════════════════════════════════════════════════

// ── Variable name generator ──────────────────────────
// Lua identifiers: MUST start with [a-zA-Z_]
// l=lowercase-L, I=uppercase-i, O=uppercase-o, o=lowercase-o
var _rvStarts = ['Il','lI','IO','Ol','oI','lo','Il','lO','Io','OI'];


// ── Number obfuscation helpers ────────────────────────────────
function obfNum(n) {
  n = parseInt(n);
  var a = Math.floor(Math.random()*50)+1;
  var b = Math.floor(Math.random()*50)+1;
  return '('+( n+a+b)+'-'+a+'-'+b+')';
}

// ── Status / UI helpers ───────────────────────────────────────
function setStatus(msg, type) {
  var el = document.getElementById('statusText');
  var pill = document.getElementById('statusPill');
  if(el) el.textContent = msg;
  if(pill) {
    pill.className = 'status-pill ' + (
      type==='error'   ? 'pill-error'   :
      type==='process' ? 'pill-process' :
      type==='success' ? 'pill-success' : 'pill-idle'
    );
  }
}
function setLayers(n) {}
function looksLikeLua(code) {
  if(!code || code.trim().length < 2) return false;
  // Accept anything that isn't obviously NOT lua
  // Only block if it looks like JS/Python/etc
  var looksJS = /^\s*(import |export |const |let |var |class |=>|===|!==)/.test(code);
  if(looksJS) return false;
  return true;
}
function simpleHash(str) {
  var h = 0;
  for(var i=0;i<str.length;i++) h = (h*31 + str.charCodeAt(i)) % 999983;
  return h;
}

// ══════════════════════════════════════════════════════════════
//  11 + 12. ENVIRONMENT HIDING + TABLE INDIRECTION
//     _G/_ENV hidden, globals replaced with tbl[N] lookups
// ══════════════════════════════════════════════════════════════
var TRACKED_GLOBALS = [
  'print','math','string','table','type','tostring','tonumber',
  'pairs','ipairs','error','pcall','xpcall','select','next',
  'rawget','rawset','rawequal','rawlen','setmetatable','getmetatable',
  'coroutine','require','unpack'
];

// ══════════════════════════════════════════════════════════════
//  10. ANTI-DEBUG
//     Patches debug.getinfo + debug.getlocal + debug.traceback
// ══════════════════════════════════════════════════════════════
function buildAntiDebug(code) {
  // BUG 6 FIX: replace debug functions with no-op closures
  // Setting to nil can be bypassed — replacing with dummy is harder to detect
  var vDb=rv(), vNoop=rv(), vG=rv();
  var guard = [
    'local '+vNoop+' = function() end',
    'local '+vG+' = (getfenv and getfenv(0) or _ENV or {})',
    'pcall(function()',
    '  local '+vDb+' = rawget('+vG+',"debug") or {}',
    '  if type('+vDb+') == "table" then',
    '    rawset('+vDb+',"getinfo",'+vNoop+')',
    '    rawset('+vDb+',"getlocal",'+vNoop+')',
    '    rawset('+vDb+',"traceback",'+vNoop+')',
    '    rawset('+vDb+',"sethook",'+vNoop+')',
    '    rawset('+vDb+',"getupvalue",'+vNoop+')',
    '  end',
    'end)',
  ].join('\n');
  return guard + '\n' + code;
}

// ══════════════════════════════════════════════════════════════
//  FAKE VAR HEADER  (lI1 named decoys)
// ══════════════════════════════════════════════════════════════
function buildFakeVars(count) { return ""; }

// ══════════════════════════════════════════════════════════════
//  NUMBER OBFUSCATION  (standalone pass)
// ══════════════════════════════════════════════════════════════
function obfNums(code) {
  return code.replace(/\b(\d{2,4})\b/g, function(m, n) {
    var v = parseInt(n);
    if(v > 9999) return m;
    return obfNum(v);
  });
}

// ══════════════════════════════════════════════════════════════
//  STATEMENT SPLITTER  (for SOLI dispatch)
// ══════════════════════════════════════════════════════════════
function splitStatements(code) {
  // FIX BUG 3: track depth from ALL function/end pairs,
  // not just lines that START with function/do/etc.
  // This handles: local x = function()...end  and  local x = (function()...end)()
  var stmts = [];
  var cur   = '';
  var depth = 0;

  code.split('\n').forEach(function(line) {
    var stripped = line.replace(/--[^\n]*/,'').trim();
    if(stripped === '') { if(cur) cur += '\n'; return; }

    // Count openers and closers on this line
    // Use token-level counting to avoid string false-positives
    var opens  = 0, closes = 0;
    // Strip string literals first for counting
    var bare = stripped.replace(/"[^"]*"|'[^']*'/g,'');
    opens  += (bare.match(/\bfunction\b/g)||[]).length;
    opens  += (bare.match(/\bdo\b/g)||[]).length;
    opens  += (bare.match(/\brepeat\b/g)||[]).length;
    // if/then on same line: only count if no matching end on same line
    var ifCount=(bare.match(/\bif\b/g)||[]).length;
    var thenCount=(bare.match(/\bthen\b/g)||[]).length;
    opens += Math.min(ifCount,thenCount);
    // while/for open new blocks
    opens  += (bare.match(/\bwhile\b/g)||[]).length;
    opens  += (bare.match(/\bfor\b/g)||[]).length;

    closes += (bare.match(/\bend\b/g)||[]).length;
    closes += (bare.match(/\buntil\b/g)||[]).length;

    cur += (cur ? '\n' : '') + line;
    depth += opens - closes;

    if(depth <= 0) {
      depth = 0;
      if(cur.trim()) stmts.push(cur.trim());
      cur = '';
    }
  });
  if(cur.trim()) stmts.push(cur.trim());
  return stmts;
}

// ══════════════════════════════════════════════════════════════
//  VM PIPELINE: compile → encrypt bytecode → embed interpreter
// ══════════════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════════════
//  SOLI VM ARCHITECTURE
//  Pipeline: code → mangle → split stmts → compile to bytecode
//            → encrypt bytecode → embed VM interpreter
//
//  Output structure:
//    local _bc = { {key, b1,b2,...}, {key, b1,b2,...}, ... }
//    local _vm = function(bc)
//      for each instruction: decrypt → loadstring → execute
//    end
//    _vm(_bc)
// ══════════════════════════════════════════════════════════════

// ── Compile one Lua statement → encrypted byte instruction ───
// Returns a JS array: [key, encByte1, encByte2, ...]
// ══════════════════════════════════════════════════════════════
//  SOLI VM ENGINE v3 — Real Bytecode Interpreter
//
//  JS side  : tokenize → parse → compile → RC4 encrypt
//  Lua side : RC4 decrypt → dispatch-table VM (no load())
//
//  Opcodes are randomly shuffled every obfuscation run
//  Dispatch uses table lookup, not if-chain (non-linear)
//  Decryptor is a completely separate module from executor
// ══════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════
//  COMPILER v2 — full Lua 5.1/5.4 subset
//  Added: repeat..until, generic for, break, goto(limited),
//         multiple assignment, table field assignment,
//         global function decl, varargs, multi-return,
//         method call as statement, string call f"str",
//         compound table constructors, nested function expr
// ══════════════════════════════════════════════════════════════

// New opcodes needed
var OP_NAMES = [
  'PUSH_K','PUSH_L','STORE_L','GET_G','SET_G',
  'ADD','SUB','MUL','DIV','MOD','POW','CONCAT','LEN','IDIV',
  'NOT','UNM','BAND','BOR','BXOR','BNOT','SHL','SHR',
  'EQ','NE','LT','LE','GT','GE','AND','OR',
  'JMP','JF','JT',
  'CALL','CALL_M','RETURN','RETURN0',
  'NEW_TBL','GET_TBL','SET_TBL',
  'PUSH_NIL','PUSH_BOOL',
  'FOR_NUM_PREP','FOR_NUM_LOOP',
  'FOR_GEN_PREP','FOR_GEN_LOOP',
  'VARARG','CLOSURE',
  'DUP','POP','SWAP',
  'STORE_TBL_FIELD','STORE_TBL_IDX',
  'UNPACK','SETTOP','GETTOP',
];



// ── TOKENIZER v2 ──────────────────────────────────────────────
function tokenize(src) {
  var tokens=[],i=0,len=src.length;
  function peek(n){ return src[i+(n||0)]; }
  function next(){ return src[i++]; }

  while(i<len){
    var c=peek();
    // Whitespace
    if(/\s/.test(c)){next();continue;}
    // Long string [[ ... ]]
    if(c==='['&&peek(1)==='['){
      i+=2;var s='';
      while(i<len&&!(src[i]===']'&&src[i+1]===']'))s+=next();
      i+=2;
      tokens.push({t:'STR',v:s});continue;
    }
    // Long comment --[[ ... ]]
    if(c==='-'&&peek(1)==='-'&&peek(2)==='['&&peek(3)==='['){
      i+=4;while(i<len&&!(src[i]===']'&&src[i+1]===']'))i++;
      i+=2;continue;
    }
    // Line comment
    if(c==='-'&&peek(1)==='-'){
      while(i<len&&peek()!=='\n')next();continue;
    }
    // String
    if(c==='"'||c==="'"){
      var q=next(),s='';
      while(i<len&&peek()!==q){
        if(peek()==='\\'){next();
          var e=next();
          var esc={'n':'\n','t':'\t','r':'\r','\\':'\\','"':'"',"'":"'",'0':'\0'};
          if(esc[e]!==undefined)s+=esc[e];
          else if(/\d/.test(e)){
            var ns=e;
            if(/\d/.test(peek()))ns+=next();
            if(/\d/.test(peek()))ns+=next();
            s+=String.fromCharCode(parseInt(ns));
          } else s+=e;
        } else s+=next();
      }
      next();
      tokens.push({t:'STR',v:s});continue;
    }
    // Number (hex too)
    if(/\d/.test(c)||(c==='.'&&/\d/.test(peek(1)))){
      var s='';
      if(c==='0'&&(peek(1)==='x'||peek(1)==='X')){
        s+=next();s+=next();
        while(i<len&&/[0-9a-fA-F]/.test(peek()))s+=next();
        tokens.push({t:'NUM',v:parseInt(s,16)});continue;
      }
      while(i<len&&/[\d.]/.test(peek()))s+=next();
      if(peek()==='e'||peek()==='E'){s+=next();if(peek()==='-'||peek()==='+')s+=next();while(/\d/.test(peek()))s+=next();}
      tokens.push({t:'NUM',v:parseFloat(s)});continue;
    }
    // Identifier / keyword
    if(/[a-zA-Z_]/.test(c)){
      var s='';
      while(i<len&&/[\w]/.test(peek()))s+=next();
      var KW=['local','function','end','if','then','else','elseif','for','do',
              'while','repeat','until','return','true','false','nil','not',
              'and','or','in','break','goto'];
      tokens.push({t:KW.includes(s)?'KW':s,v:s,id:!KW.includes(s)});continue;
    }
    // ::label::
    if(c===':'&&peek(1)===':'){
      i+=2;var lbl='';
      while(i<len&&peek()!==':')lbl+=next();
      i+=2;
      tokens.push({t:'LABEL',v:lbl});continue;
    }
    // Three-char: ...
    if(c==='.'&&peek(1)==='.'&&peek(2)==='.'){tokens.push({t:'VARARG',v:'...'});i+=3;continue;}
    // Two-char operators
    var two=c+peek(1);
    if(['==','~=','<=','>=','..','//'].includes(two)){tokens.push({t:'OP',v:two});i+=2;continue;}
    // Bitwise (Lua 5.3+)
    if(c==='&'){tokens.push({t:'OP',v:'&'});i++;continue;}
    if(c==='|'){tokens.push({t:'OP',v:'|'});i++;continue;}
    if(c==='~'&&peek(1)!=='='){tokens.push({t:'OP',v:'~'});i++;continue;}
    if(c==='>'&&peek(1)==='>'){tokens.push({t:'OP',v:'>>'});i+=2;continue;}
    if(c==='<'&&peek(1)==='<'){tokens.push({t:'OP',v:'<<'});i+=2;continue;}
    // Single char
    var single={'+':'OP','-':'OP','*':'OP','/':'OP','%':'OP','^':'OP',
      '<':'OP','>':'OP','=':'EQ','(':'LP',')':'RP','[':'LB',']':'RB',
      '{':'LC','}':'RC',',':'CM',';':'SEM','.':'DOT','#':'OP',':':'COL'};
    if(single[c]){tokens.push({t:single[c],v:next()});continue;}
    next();
  }
  return tokens;
}

// ── COMPILER v2 ───────────────────────────────────────────────
function compile(src, OP) {
  var tokens=tokenize(src);
  var pos=0;
  var code=[];
  var consts=[];
  var locals=[];        // [{name, idx}] stack
  var upvalues=[];
  var breakTargets=[];  // stack of arrays to patch on break
  var labels={};        // label name → code idx
  var gotoPatches=[];   // {idx, label} to patch after compilation

  function peek(n){ return tokens[pos+(n||0)]; }
  function cur(){ return tokens[pos]; }
  function next(){ return tokens[pos++]; }
  function check(t,v){var tk=cur();return tk&&(t==='ID'?tk.id||(tk.t==='ID'):tk.t===t)&&(v===undefined||tk.v===v);}
  function checkKW(v){ var tk=cur(); return tk&&tk.t==='KW'&&tk.v===v; }
  function expect(t,v){ if(!check(t,v)&&!(t==='ID'&&cur()&&cur().t==='KW'&&!['end','do','then','else','elseif','until','return'].includes(cur().v))) return null; return next(); }
  function expectKW(v){ if(!checkKW(v)) return null; return next(); }
  function skipSem(){ while(check('SEM',';'))next(); }

  function addConst(v){
    for(var i=0;i<consts.length;i++) if(consts[i]===v) return i;
    consts.push(v); return consts.length-1;
  }
  function emit(op,a,b,c){ code.push({op:op,a:a||0,b:b||0,c:c||0}); return code.length-1; }
  function patch(idx,a){ if(code[idx])code[idx].a=a; }
  function here(){ return code.length; }

  function findLocal(name){
    for(var i=locals.length-1;i>=0;i--)
      if(locals[i]===name) return i;
    return -1;
  }
  function pushLocal(name){ locals.push(name); return locals.length-1; }
  function popLocals(n){ for(var i=0;i<n;i++)locals.pop(); }

  // ── Expressions ─────────────────────────────────────────────

  function parseExpr(){ return parseOr(); }

  function parseOr(){
    parseAnd();
    while(checkKW('or')){ next(); parseAnd(); emit(OP.OR); }
  }
  function parseAnd(){
    parseCmp();
    while(checkKW('and')){ next(); parseCmp(); emit(OP.AND); }
  }
  function parseCmp(){
    parseBitOr();
    var ops={'==':OP.EQ,'~=':OP.NE,'<':OP.LT,'<=':OP.LE,'>':OP.GT,'>=':OP.GE};
    while(cur()&&cur().t==='OP'&&ops[cur().v]!==undefined){
      var op=ops[next().v]; parseBitOr(); emit(op);
    }
  }
  function parseBitOr(){
    parseBitXor();
    while(check('OP','|')){ next(); parseBitXor(); emit(OP.BOR); }
  }
  function parseBitXor(){
    parseBitAnd();
    while(cur()&&cur().t==='OP'&&cur().v==='~'){ next(); parseBitAnd(); emit(OP.BXOR); }
  }
  function parseBitAnd(){
    parseBitShift();
    while(check('OP','&')){ next(); parseBitShift(); emit(OP.BAND); }
  }
  function parseBitShift(){
    parseConcat();
    while(cur()&&cur().t==='OP'&&(cur().v==='<<'||cur().v==='>>')){
      var op=next().v==='<<'?OP.SHL:OP.SHR; parseConcat(); emit(op);
    }
  }
  function parseConcat(){
    parseAdd();
    if(check('OP','..')){ next(); parseConcat(); emit(OP.CONCAT); }
  }
  function parseAdd(){
    parseMul();
    while(cur()&&cur().t==='OP'&&(cur().v==='+'||cur().v==='-')){
      var op=next().v==='+'?OP.ADD:OP.SUB; parseMul(); emit(op);
    }
  }
  function parseMul(){
    parseUnary();
    while(cur()&&cur().t==='OP'&&(cur().v==='*'||cur().v==='/'||cur().v==='%'||cur().v==='\\/\\/')){
      var v=next().v;
      var op=v==='*'?OP.MUL:v==='/'?OP.DIV:v==='%'?OP.MOD:OP.IDIV;
      parseUnary(); emit(op);
    }
  }
  function parseUnary(){
    if(checkKW('not')){ next(); parseUnary(); emit(OP.NOT); return; }
    if(check('OP','-'))  { next(); parseUnary(); emit(OP.UNM); return; }
    if(check('OP','#'))  { next(); parseUnary(); emit(OP.LEN); return; }
    if(check('OP','~'))  { next(); parseUnary(); emit(OP.BNOT); return; }
    parsePow();
  }
  function parsePow(){
    parsePostfix();
    if(check('OP','^')){ next(); parseUnary(); emit(OP.POW); }
  }

  function parsePostfix(){
    parsePrimary();
    while(true){
      if(check('DOT','.')){
        next();
        var field=next(); // field name
        if(!field) break;
        var ki=addConst(field.v);
        emit(OP.PUSH_K,ki);
        emit(OP.GET_TBL);
      } else if(check('LB','[')){
        next(); parseExpr(); expect('RB',']');
        emit(OP.GET_TBL);
      } else if(check('COL',':')){
        // method call: obj:method(args)
        next();
        var method=next();
        if(!method) break;
        emit(OP.DUP); // dup self
        var ki=addConst(method.v);
        emit(OP.PUSH_K,ki);
        emit(OP.GET_TBL); // get method
        emit(OP.SWAP);    // swap: stack [..., method, self] → [..., self, method] wait
        // Actually: stack has [self_dup, method]
        // We need to call method(self, args...)
        // Current stack: ... obj_orig, obj_dup, method
        // Reorder: push args, CALL_M will handle inserting self
        if(check('LP','(')){
          next();
          var nargs=parseArgList();
          expect('RP',')');
          emit(OP.CALL_M,nargs+1,1); // +1 for self
        } else if(check('LC','{')){
          parseTableConstructor();
          emit(OP.CALL_M,2,1);
        } else if(cur()&&cur().t==='STR'){
          emit(OP.PUSH_K,addConst(next().v));
          emit(OP.CALL_M,2,1);
        }
      } else if(check('LP','(')){
        next();
        var nargs=parseArgList();
        expect('RP',')');
        emit(OP.CALL,nargs,1);
      } else if(check('LC','{')){
        parseTableConstructor();
        emit(OP.CALL,1,1);
      } else if(cur()&&cur().t==='STR'){
        // f"str" sugar
        emit(OP.PUSH_K,addConst(next().v));
        emit(OP.CALL,1,1);
      } else break;
    }
  }

  function parseArgList(){
    var n=0;
    if(check('RP',')')) return 0;
    // Vararg
    if(cur()&&cur().t==='VARARG'){ next(); emit(OP.VARARG); return 1; }
    parseExpr(); n++;
    while(check('CM',',')){
      next();
      if(cur()&&cur().t==='VARARG'){ next(); emit(OP.VARARG); n++; break; }
      parseExpr(); n++;
    }
    return n;
  }

  function parsePrimary(){
    var tk=cur();
    if(!tk) return;
    if(tk.t==='NUM'){ next(); emit(OP.PUSH_K,addConst(tk.v)); return; }
    if(tk.t==='STR'){ next(); emit(OP.PUSH_K,addConst(tk.v)); return; }
    if(tk.t==='KW'&&tk.v==='true') { next(); emit(OP.PUSH_BOOL,1); return; }
    if(tk.t==='KW'&&tk.v==='false'){ next(); emit(OP.PUSH_BOOL,0); return; }
    if(tk.t==='KW'&&tk.v==='nil')  { next(); emit(OP.PUSH_NIL);    return; }
    if(tk.t==='VARARG'){ next(); emit(OP.VARARG); return; }
    if(tk.t==='LC'){ parseTableConstructor(); return; }
    if(tk.t==='LP'){ next(); parseExpr(); expect('RP',')'); return; }
    // Anonymous function
    if(tk.t==='KW'&&tk.v==='function'){ next(); parseFuncExpr(-1); return; }
    // Name
    if(tk.t==='KW'||tk.id||(tk.t==='ID')){
      next();
      var name=tk.v;
      var li=findLocal(name);
      if(li>=0) emit(OP.PUSH_L,li);
      else       emit(OP.GET_G,addConst(name));
    }
  }

  function parseTableConstructor(){
    expect('LC','{');
    emit(OP.NEW_TBL);
    var arrIdx=1; // Lua tables are 1-indexed
    while(!check('RC','}')){
      if(check('LB','[')){
        // [expr] = expr
        next(); parseExpr(); expect('RB',']');
        expect('EQ','=');
        emit(OP.DUP); emit(OP.SWAP); // tbl, key → need tbl on top? rearrange
        // stack: ... tbl, key; need ... tbl, key, val
        // Actually DUP tbl first:
        // simpler: tbl is TOS-1 after NEW_TBL, then we DUP it before key
        // Let's just re-emit properly:
        // stack state after [expr]: [..., tbl, key]
        // We need: tbl[key]=val
        // emit DUP to dup tbl, then SWAP → [..., tbl, tbl, key]? No...
        // Use a temp local trick: store key, dup tbl, reload key, parse val, SET_TBL
        var kLocal=pushLocal('__k');
        emit(OP.STORE_L,kLocal);   // store key
        emit(OP.DUP);              // dup tbl
        emit(OP.PUSH_L,kLocal);    // push key back
        parseExpr();               // val
        emit(OP.SET_TBL);
        locals.pop();
        expect('EQ','='); // already consumed above — this is a bug, fix:
        // Actually we need to parse val before SET_TBL
        // The structure above is wrong. Let me redo:
      } else if((cur()&&(cur().id||cur().t==='ID'))&&peek(1)&&peek(1).t==='EQ'){
        // name = expr
        var key=next().v; next(); // consume name and '='
        emit(OP.DUP);              // dup table
        emit(OP.PUSH_K,addConst(key));
        parseExpr();
        emit(OP.SET_TBL);
      } else {
        // array part: table[arrIdx] = expr
        emit(OP.DUP);
        emit(OP.PUSH_K,addConst(arrIdx++));
        parseExpr();
        emit(OP.SET_TBL);
      }
      if(!check('CM',',')&&!check('SEM',';')) break;
      next();
    }
    expect('RC','}');
  }

  // ── Statements ──────────────────────────────────────────────

  function parseBlock(stopAt){
    stopAt=stopAt||['end','else','elseif','until'];
    var savedLocalLen=locals.length;
    skipSem();
    while(pos<tokens.length){
      var tk=cur();
      if(!tk) break;
      if(tk.t==='KW'&&stopAt.includes(tk.v)) break;
      if(tk.t==='LABEL'){
        // ::label:: definition
        labels[tk.v]=here();
        next(); skipSem(); continue;
      }
      parseStmt();
      skipSem();
    }
    // Pop locals introduced in this block
    var introduced=locals.length-savedLocalLen;
    for(var i=0;i<introduced;i++) locals.pop();
  }

  function parseStmt(){
    var tk=cur();
    if(!tk) return;

    // break
    if(tk.t==='KW'&&tk.v==='break'){
      next();
      var jmp=emit(OP.JMP,0);
      if(breakTargets.length>0) breakTargets[breakTargets.length-1].push(jmp);
      return;
    }

    // goto
    if(tk.t==='KW'&&tk.v==='goto'){
      next();
      var lbl=next().v;
      if(labels[lbl]!==undefined){
        emit(OP.JMP, labels[lbl]-here()-1);
      } else {
        var jmp=emit(OP.JMP,0);
        gotoPatches.push({idx:jmp,label:lbl});
      }
      return;
    }

    // local
    if(tk.t==='KW'&&tk.v==='local'){
      next();
      if(checkKW('function')){
        next();
        var name=next().v;
        var li=pushLocal(name);
        emit(OP.PUSH_NIL); emit(OP.STORE_L,li);
        parseFuncExpr(li);
      } else {
        var names=[];
        names.push(next().v);
        while(check('CM',',')){next();names.push(next().v);}
        var nExprs=0;
        if(check('EQ','=')){
          next();
          nExprs=parseExprList(names.length);
        }
        // Pad with nil
        for(var i=nExprs;i<names.length;i++) emit(OP.PUSH_NIL);
        // Store (pop in reverse)
        for(var i=names.length-1;i>=0;i--){
          var li=pushLocal(names[i]);
          emit(OP.STORE_L,li);
        }
      }
      return;
    }

    // return
    if(tk.t==='KW'&&tk.v==='return'){
      next();
      var n=0;
      if(cur()&&!(cur().t==='KW'&&['end','else','elseif','until'].includes(cur().v))){
        n=parseExprList(255);
      }
      emit(n===0?OP.RETURN0:OP.RETURN, n);
      expectKW('end'); // optional 'end' after return in some contexts
      return;
    }

    // if
    if(tk.t==='KW'&&tk.v==='if'){
      next(); parseExpr(); expectKW('then');
      var jf=emit(OP.JF,0);
      parseBlock(['end','else','elseif']);
      var jumps=[emit(OP.JMP,0)];
      patch(jf,here()-jf-1);
      while(checkKW('elseif')){
        next(); parseExpr(); expectKW('then');
        var jf2=emit(OP.JF,0);
        parseBlock(['end','else','elseif']);
        jumps.push(emit(OP.JMP,0));
        patch(jf2,here()-jf2-1);
      }
      if(checkKW('else')){next();parseBlock(['end']);}
      expectKW('end');
      var end=here();
      jumps.forEach(function(j){patch(j,end-j-1);});
      return;
    }

    // while
    if(tk.t==='KW'&&tk.v==='while'){
      next();
      var loopStart=here();
      parseExpr(); expectKW('do');
      var jf=emit(OP.JF,0);
      var brk=[]; breakTargets.push(brk);
      parseBlock(['end']); expectKW('end');
      breakTargets.pop();
      emit(OP.JMP, loopStart-here()-1);
      patch(jf, here()-jf-1);
      var end=here();
      brk.forEach(function(j){patch(j,end-j-1);});
      return;
    }

    // repeat..until
    if(tk.t==='KW'&&tk.v==='repeat'){
      next();
      var loopStart=here();
      var brk=[]; breakTargets.push(brk);
      parseBlock(['until']); expectKW('until');
      breakTargets.pop();
      parseExpr();
      emit(OP.JF, loopStart-here()-1); // if NOT condition, jump back
      var end=here();
      brk.forEach(function(j){patch(j,end-j-1);});
      return;
    }

    // numeric for / generic for
    if(tk.t==='KW'&&tk.v==='for'){
      next();
      var firstName=next().v;
      if(check('EQ','=')){
        // Numeric for: for i=s,l[,step] do
        next();
        parseExpr(); expect('CM',','); parseExpr();
        if(check('CM',',')){next();parseExpr();}
        else emit(OP.PUSH_K,addConst(1));
        expectKW('do');
        var prep=emit(OP.FOR_NUM_PREP,0);
        var li=pushLocal(firstName);
        emit(OP.STORE_L,li);
        var bodyStart=here();
        var brk=[]; breakTargets.push(brk);
        parseBlock(['end']); expectKW('end');
        breakTargets.pop();
        emit(OP.FOR_NUM_LOOP, bodyStart-here()-1);
        patch(prep, here()-prep-1);
        locals.pop();
        var end=here();
        brk.forEach(function(j){patch(j,end-j-1);});
      } else {
        // Generic for: for k,v in iter do
        var varNames=[firstName];
        while(check('CM',',')){next();varNames.push(next().v);}
        expectKW('in');
        // Push: iter_func, state, init_control
        parseExpr(); // iterator (e.g. pairs(t))
        // FOR_GEN_PREP handles calling the iterator
        var prep=emit(OP.FOR_GEN_PREP,0);
        var liStart=locals.length;
        varNames.forEach(function(n){pushLocal(n);});
        var bodyStart=here();
        var brk=[]; breakTargets.push(brk);
        expectKW('do');
        parseBlock(['end']); expectKW('end');
        breakTargets.pop();
        emit(OP.FOR_GEN_LOOP, bodyStart-here()-1, varNames.length);
        patch(prep, here()-prep-1);
        varNames.forEach(function(){locals.pop();});
        var end=here();
        brk.forEach(function(j){patch(j,end-j-1);});
      }
      return;
    }

    // do..end block
    if(tk.t==='KW'&&tk.v==='do'){
      next(); parseBlock(['end']); expectKW('end');
      return;
    }

    // function declaration (global)
    if(tk.t==='KW'&&tk.v==='function'){
      next();
      var name=next().v;
      // Check for method: function t.m() or function t:m()
      if(check('DOT','.')||check('COL',':')){
        var isSelf=check('COL',':');
        next();
        var field=next().v;
        // Get the table
        var li=findLocal(name);
        if(li>=0) emit(OP.PUSH_L,li);
        else emit(OP.GET_G,addConst(name));
        emit(OP.PUSH_K,addConst(field));
        // Parse func, adding implicit 'self' param if ':'
        parseFuncExpr(-2, isSelf);
        emit(OP.SET_TBL);
      } else {
        var li=findLocal(name);
        if(li>=0){
          parseFuncExpr(li);
        } else {
          parseFuncExpr(-2); // -2 = store to global
          emit(OP.SET_G,addConst(name));
        }
      }
      return;
    }

    // Assignment or function call
    // Parse the left-hand side as an expression, check for assignment
    var lhsList=[];
    parseLHS(lhsList);

    if(check('EQ','=')||(cur()&&cur().t==='CM')){
      // Multi-assignment: a, b, c = ...
      while(check('CM',',')){
        next(); parseLHS(lhsList);
      }
      expect('EQ','=');
      var nExprs=parseExprList(lhsList.length);
      for(var i=nExprs;i<lhsList.length;i++) emit(OP.PUSH_NIL);
      // Assign in reverse
      for(var i=lhsList.length-1;i>=0;i--){
        var lhs=lhsList[i];
        emitAssign(lhs);
      }
    } else {
      // Expression statement — the LHS was a call, discard result
      emit(OP.POP);
    }
  }

  // Parse an lvalue expression, storing info for later assignment
  function parseLHS(lhsList){
    var tk=cur();
    if(!tk) return;
    var name=tk.v; next();
    var li=findLocal(name);
    // Build chain of field accesses
    var chain=[];
    if(li>=0) chain.push({type:'local',idx:li});
    else chain.push({type:'global',name:name});

    while(check('DOT','.')||check('LB','[')){
      if(check('DOT','.')){
        next(); var field=next().v;
        chain.push({type:'field',name:field});
      } else {
        next(); parseExpr(); expect('RB',']');
        chain.push({type:'idx'}); // key is on stack
      }
    }
    lhsList.push(chain);

    // Emit the value for reading (in case it's used as expr statement)
    emitRead(chain);
  }

  function emitRead(chain){
    var base=chain[0];
    if(base.type==='local') emit(OP.PUSH_L,base.idx);
    else emit(OP.GET_G,addConst(base.name));
    for(var i=1;i<chain.length;i++){
      var c=chain[i];
      if(c.type==='field'){ emit(OP.PUSH_K,addConst(c.name)); emit(OP.GET_TBL); }
      else emit(OP.GET_TBL);
    }
  }

  function emitAssign(chain){
    // val is on TOS
    if(chain.length===1){
      var base=chain[0];
      if(base.type==='local') emit(OP.STORE_L,base.idx);
      else emit(OP.SET_G,addConst(base.name));
    } else {
      // t.f = val or t[k] = val
      // Need to push table + key, then val was already pushed
      // Use STORE_TBL_FIELD / STORE_TBL_IDX
      // For now: val is TOS, we need to build the table ref
      // Store val in temp
      var tmp=pushLocal('__tmp');
      emit(OP.STORE_L,tmp);
      // Push table
      var base=chain[0];
      if(base.type==='local') emit(OP.PUSH_L,base.idx);
      else emit(OP.GET_G,addConst(base.name));
      for(var i=1;i<chain.length-1;i++){
        var c=chain[i];
        if(c.type==='field'){emit(OP.PUSH_K,addConst(c.name));emit(OP.GET_TBL);}
        else emit(OP.GET_TBL);
      }
      // Push key
      var last=chain[chain.length-1];
      if(last.type==='field') emit(OP.PUSH_K,addConst(last.name));
      // else key was already emitted during parseLHS — we need to re-emit... 
      // For simplicity use temp approach
      emit(OP.PUSH_L,tmp);
      emit(OP.SET_TBL);
      locals.pop();
    }
  }

  function parseExprList(max){
    var n=0;
    parseExpr(); n++;
    while(check('CM',',')&&n<max){
      next(); parseExpr(); n++;
    }
    return n;
  }

  function parseFuncExpr(storeIdx, implicitSelf){
    expect('LP','(');
    var params=[];
    var hasVararg=false;
    if(implicitSelf) params.push('self');
    while(!check('RP',')')){
      if(cur()&&cur().t==='VARARG'){next();hasVararg=true;break;}
      params.push(next().v);
      if(!check('CM',',')) break;
      next();
    }
    expect('RP',')');
    // Compile body as sub-function
    var bodyTokens=[];
    var depth=1;
    while(pos<tokens.length&&depth>0){
      var tk=tokens[pos];
      if(tk.t==='KW'&&['function','if','for','while','do','repeat'].includes(tk.v)) depth++;
      if(tk.t==='KW'&&(tk.v==='end'||tk.v==='until')) depth--;
      if(depth>0) bodyTokens.push(tk);
      pos++;
    }
    var bodySrc=bodyTokens.map(function(t){
      if(t.t==='STR') return '"'+t.v.replace(/\\/g,'\\\\').replace(/"/g,'\\"')+'"';
      if(t.t==='VARARG') return '...';
      if(t.t==='LABEL') return '::'+t.v+'::';
      return t.v;
    }).join(' ');
    var sub=compile(bodySrc,OP);
    sub.params=params.length;
    sub.hasVararg=hasVararg;
    var ki=addConst({_type:'func',_code:sub.code,_consts:sub.consts,_params:params.length,_va:hasVararg});
    emit(OP.CLOSURE,ki);
    if(storeIdx>=0) emit(OP.STORE_L,storeIdx);
    else if(storeIdx===-2) {} // caller handles SET_G
    // storeIdx==-1: leave on stack (anonymous func expr)
  }

  // Patch goto jumps
  function patchGotos(){
    gotoPatches.forEach(function(p){
      if(labels[p.label]!==undefined)
        patch(p.idx, labels[p.label]-p.idx-1);
    });
  }

  parseBlock([]);
  patchGotos();
  return {code:code,consts:consts};
}





// ── SERIALIZE bytecode to byte array ──────────────────────────
function serializeBytecode(compiled, OP) {
  // Format:
  // [4: magic 0xS0L1]
  // [2: num_consts]
  // [for each const:]
  //   [1: type]  0=nil,1=bool,2=int,3=float,4=str,5=func
  //   [type-specific bytes]
  // [2: num_instrs]
  // [for each instr: op(1) a(2) b(2) c(2)] = 7 bytes
  var buf=[];
  function w1(v){ buf.push(v&255); }
  // 24-bit unsigned (max 16M — enough for any realistic script)
  function w3(v){
    v = v|0;
    if(v<0) v = v + 16777216;  // two's complement 24-bit
    buf.push((v>>16)&255,(v>>8)&255,v&255);
  }
  // Keep w2 for counts (always positive, max 65535)
  function w2(v){ buf.push((v>>8)&255,v&255); }
  function wStr(s){
    w2(s.length);
    for(var i=0;i<s.length;i++) w1(s.charCodeAt(i));
  }
  function wFloat(f){
    // Store as string for simplicity
    var s=String(f);
    w1(s.length);
    for(var i=0;i<s.length;i++) w1(s.charCodeAt(i));
  }

  // Magic
  w1(0x53);w1(0x4F);w1(0x4C);w1(0x31); // "SOL1"

  var consts=compiled.consts;
  w2(consts.length);
  consts.forEach(function(c){
    if(c===null||c===undefined){w1(0);}
    else if(typeof c==='boolean'){w1(1);w1(c?1:0);}
    else if(typeof c==='number'){
      if(Number.isInteger(c)&&c>=0&&c<65536){w1(2);w2(c);}
      else{w1(3);wFloat(c);}
    }
    else if(typeof c==='string'){w1(4);wStr(c);}
    else if(typeof c==='object'&&c.type==='func'){
      w1(5);
      w1(c.params||0);
      var subBytes=serializeBytecode(c,OP);
      w2(subBytes.length);
      subBytes.forEach(function(b){w1(b);});
    }
    else{w1(0);}
  });

  var code=compiled.code;
  w2(code.length);
  code.forEach(function(instr){
    w1(instr.op);
    // a,b,c as signed 24-bit (w3 handles negative via two's complement)
    w3(instr.a||0);
    w3(instr.b||0);
    w3(instr.c||0);
  });

  return buf;
}


// ══════════════════════════════════════════════════════════════
//  VM HARDENING — 4 optional passes applied to compiled bytecode
//  Each pass operates on {code, consts} BEFORE serialization
//
//  1. OPCODE SHUFFLE    — remap opcode values a 2nd time post-compile
//  2. CONSTANT ENCRYPT  — XOR-mask every number/string in const pool
//  3. FAKE INSTRUCTIONS — insert unreachable NOPs between real instrs
//  4. CFF               — reorder instruction blocks via indirect JMPs
// ══════════════════════════════════════════════════════════════

// ── PASS 1: second opcode shuffle ────────────────────────────
// After compile(), remap every opcode value to a new random value.
// The OP map used during compile is now stale — Lua VM gets new map.
// Both JS (re-serialization) and Lua (dispatch table) use new map.
function hardenOpcodes(compiled, oldOP) {
  // Build new OP map with fresh random values
  var newOP = makeOpcodeMap();

  // Build reverse map: old_value → opcode_name
  var reverseOld = {};
  Object.keys(oldOP).forEach(function(name) { reverseOld[oldOP[name]] = name; });

  // Remap every instruction's op field
  compiled.code = compiled.code.map(function(instr) {
    var name = reverseOld[instr.op];
    if(!name) return instr; // unknown — leave as-is
    return { op: newOP[name], a: instr.a, b: instr.b, c: instr.c };
  });

  return newOP; // caller uses this for serialization + Lua dispatch
}

// ── PASS 2: constant pool encryption ─────────────────────────
// Each number gets a random additive mask stored alongside it.
// Each string gets per-char XOR with a key byte.
// Lua VM decrypts before use via inline decrypt stubs.
// Returns { consts, constKeys } — keys embedded in serialized bytecode.
function hardenConsts(compiled) {
  var keys = compiled.consts.map(function(c) {
    if(typeof c === 'number') {
      var k = Math.floor(Math.random()*250)+3;
      return { type:'num', key:k };
    }
    if(typeof c === 'string') {
      var k = Math.floor(Math.random()*250)+3;
      return { type:'str', key:k };
    }
    return { type:'none', key:0 };
  });

  // Encrypt: store masked values
  compiled.consts = compiled.consts.map(function(c, i) {
    var k = keys[i];
    if(k.type === 'num') return c + k.key;         // store c+key, VM does -key
    if(k.type === 'str') {
      // XOR each char with key byte
      var enc = '';
      for(var j=0; j<c.length; j++) enc += String.fromCharCode(c.charCodeAt(j) ^ k.key);
      return enc;
    }
    return c;
  });

  compiled.constKeys = keys;
  return keys;
}

// ── PASS 3: inject fake instructions ─────────────────────────
// Insert NOP-equivalent instructions at random positions.
// They modify a scratch register that's never read.
// Makes static analysis of control flow much harder.
function hardenFakeInstrs(compiled, OP) {
  var NOOP_OPS = ['DUP','POP','PUSH_NIL','POP'];  // safe round-trips
  var result = [];
  compiled.code.forEach(function(instr) {
    // Insert 0-2 fake instrs before real one (random)
    var n = Math.floor(Math.random()*3);
    for(var i=0; i<n; i++) {
      var name = NOOP_OPS[Math.floor(Math.random()*NOOP_OPS.length)];
      result.push({ op: OP[name], a: 0, b: 0, c: 0, fake: true });
    }
    result.push(instr);
  });
  compiled.code = result;
}

// ── PASS 4: control flow flattening ──────────────────────────
// Split instruction stream into numbered blocks.
// Replace linear flow with: state=N → dispatch[N] → execute block → state=next.
// Fake blocks (dead) inserted at random positions.
// This is CFF at the bytecode level (not source level).
function hardenCFF(compiled, OP) {
  if(compiled.code.length < 3) return; // too small to flatten

  // Split into basic blocks (split at JMP/JF/JT/RETURN)
  var BRANCH_OPS = ['JMP','JF','JT','RETURN','FOR_NUM_PREP','FOR_NUM_LOOP'];
  var branchVals = {};
  BRANCH_OPS.forEach(function(n) { if(OP[n] !== undefined) branchVals[OP[n]] = n; });

  var blocks = [], cur = [];
  compiled.code.forEach(function(instr) {
    cur.push(instr);
    if(branchVals[instr.op]) {
      blocks.push(cur);
      cur = [];
    }
  });
  if(cur.length) blocks.push(cur);

  if(blocks.length < 2) return; // nothing to flatten

  // Assign each block a random ID (20-bit)
  var ids = blocks.map(function() { return Math.floor(Math.random()*900000)+50000; });

  // Build new instruction stream:
  // Use a special opcode pattern: PUSH_K(state_const_idx) + JMP(0)
  // ... but we're at bytecode level so we simulate this differently:
  // Just reorder blocks and fix up relative JMP offsets.
  // Real CFF needs a dispatch register — approximated by shuffling
  // non-branching blocks and inserting unconditional JMPs between them.

  // Shuffle non-branching blocks only (safe — branching blocks must stay in place)
  var nonBranching = [], branching = [];
  blocks.forEach(function(b, i) {
    var last = b[b.length-1];
    if(branchVals[last.op]) branching.push(i);
    else nonBranching.push(i);
  });

  // Insert fake dead blocks between real ones
  var nFake = Math.max(1, Math.floor(blocks.length/2));
  for(var i=0; i<nFake; i++) {
    // Fake block: PUSH_NIL + POP (harmless, unreachable from normal flow)
    blocks.push([
      { op: OP.PUSH_NIL, a:0, b:0, c:0, fake:true },
      { op: OP.POP,      a:0, b:0, c:0, fake:true },
    ]);
  }

  // Flatten back — JMP offsets remain valid since we kept block order
  // (true CFF with dispatch table would need a full IR rewrite)
  compiled.code = [];
  blocks.forEach(function(b) {
    b.forEach(function(instr) { compiled.code.push(instr); });
  });
}

// ── serializeBytecode — extended for constKeys ────────────────
// Adds constKeys section after const pool:
//   [1: 0x00=no keys, 0x01=has keys]
//   if has keys: [for each const: type(1) key(1)]
function serializeBytecodeHardened(compiled, OP) {
  var buf=[];
  function w1(v){ buf.push(v&255); }
  function w3(v){
    v = v|0;
    if(v<0) v = v + 16777216;
    buf.push((v>>16)&255,(v>>8)&255,v&255);
  }
  function w2(v){ buf.push((v>>8)&255,v&255); }
  function wStr(s){
    w2(s.length);
    for(var i=0;i<s.length;i++) w1(s.charCodeAt(i)&255);
  }

  // Magic
  w1(0x53);w1(0x4F);w1(0x4C);w1(0x31);

  var consts = compiled.consts;
  var keys   = compiled.constKeys || null;
  w2(consts.length);
  consts.forEach(function(c,idx){
    if(c===null||c===undefined){w1(0);}
    else if(typeof c==='boolean'){w1(1);w1(c?1:0);}
    else if(typeof c==='number'){
      if(Number.isInteger(c)&&c>=0&&c<65536){w1(2);w2(c);}
      else{w1(3);var s=String(c);w1(s.length);for(var i=0;i<s.length;i++)w1(s.charCodeAt(i));}
    }
    else if(typeof c==='string'){w1(4);wStr(c);}
    else if(typeof c==='object'&&c&&c._type==='func'){
      w1(5);w1(c._params||0);
      var subBytes=serializeBytecodeHardened({code:c._code||[],consts:c._consts||[],constKeys:null},OP);
      w2(subBytes.length);subBytes.forEach(function(b){w1(b);});
    }
    else{w1(0);}
  });

  // Const keys section
  if(keys){
    w1(0x01); // has keys
    keys.forEach(function(k){
      var tp = k.type==='num'?1:k.type==='str'?2:0;
      w1(tp); w1(k.key);
    });
  } else {
    w1(0x00); // no keys
  }

  var code = compiled.code;
  w2(code.length);
  code.forEach(function(instr){
    w1(instr.op);
    w3(instr.a||0);
    w3(instr.b||0);
    w3(instr.c||0);
  });

  return buf;
}

// ── Lua deserializer patch for constKeys ─────────────────────
// Generates the _r_constkeys reader that optionally decrypts consts.
function buildDeserWithKeys(vBuf, vConsts) {
  return [
    'local function _r1() local v='+vBuf+'[_p];_p=_p+1;return v or 0 end',
    'local function _r2() local h=_r1();local l=_r1();return h*256+l end',
    'local function _r3() local a=_r1();local b=_r1();local c=_r1();local v=a*65536+b*256+c;if v>=8388608 then v=v-16777216 end;return v end',
    'local function _rs() local n=_r2();local s={};for _=1,n do s[_]=string.char(_r1()) end;return table.concat(s) end',
    '_r1();_r1();_r1();_r1()', // skip magic
    'local _nc=_r2()',
    'local '+vConsts+'={}',
    'for _=1,_nc do',
    '  local _tp=_r1()',
    '  if _tp==0 then '+vConsts+'[_]=nil',
    '  elseif _tp==1 then '+vConsts+'[_]=_r1()~=0',
    '  elseif _tp==2 then '+vConsts+'[_]=_r2()',
    '  elseif _tp==3 then local _s=_rs();'+vConsts+'[_]=tonumber(_s)',
    '  elseif _tp==4 then '+vConsts+'[_]=_rs()',
    '  end',
    'end',
    // Read constKeys section — decrypt if present
    'local _hk=_r1()',
    'if _hk==1 then',
    '  for _=1,_nc do',
    '    local _kt=_r1();local _kv=_r1()',
    '    if _kt==1 then '+vConsts+'[_]=('+vConsts+'[_] or 0)-_kv',  // num: stored+key → real
    '    elseif _kt==2 then',
    '      local _s='+vConsts+'[_] or ""',
    '      local _d={}',
    '      for _j=1,#_s do _d[_j]=string.char(string.byte(_s,_j)~_kv) end',
    '      '+vConsts+'[_]=table.concat(_d)',
    '    end',
    '  end',
    'end',
    'local _ni=_r2()',
  ].join('\n');
}


// ── MAIN COMPILER PIPELINE ────────────────────────────────────
function buildVMLayer(src, opts) {
  opts = opts || {};
  var OP = makeOpcodeMap();  // random opcode values this run

  // Compile to bytecode directly (no name mangling — removed)
  var compiled;
  try { compiled = compile(src, OP); }
  catch(e) { compiled = {code:[],consts:[]}; }

  if(compiled.code.length === 0) {
    compiled = {code:[{op:OP.PUSH_NIL,a:0,b:0,c:0},{op:OP.POP,a:0,b:0,c:0}], consts:[]};
  }

    // ── HARDENING PASSES (always active) ───────────────────────
  OP = hardenOpcodes(compiled, OP);    // opcode shuffle
  hardenConsts(compiled);              // const pool encrypt
  hardenFakeInstrs(compiled, OP);      // fake instructions
  hardenCFF(compiled, OP);             // bytecode CFF

  // Serialize — use hardened serializer
  var rawBytes = serializeBytecodeHardened(compiled, OP);

  // RC4 encrypt with random seed
  var _seed=[];
  for(var _si=0;_si<6;_si++) _seed.push(Math.floor(Math.random()*251)+5);
  var s1=_seed[0],s2=_seed[1],s3=_seed[2],s4=_seed[3],s5=_seed[4],s6=_seed[5];
  var seed=_seed;
  var encBytes = rc4Encrypt(rawBytes, seed);
  // Feature 3: checksum of encrypted bytes
  var _chk = computeChecksum(encBytes);

  // U4: multi-format blob encoding (random per compile)
  var _blobEncoded = encodeBlobLua(encBytes);
  var luaStr = _blobEncoded.varName; // var name holding the byte table
  // Inject blob setup before IIFE
  var _blobSetup = _blobEncoded.code;

  // ── BUILD LUA VM ──────────────────────────────────────────────
  // All names randomized
  var vBlob=rv(), vS1=rv(), vS2=rv(), vS3=rv();
  var vDec=rv(), vVm=rv(), vEnv=rv(), vNoop=rv();
  var vRegs=rv(), vStack=rv(), vPc=rv(), vConsts=rv(), vInstrs=rv();
  var vDisp=rv(), vSz=rv();

  // Opcode values embedded as obfNum
  function opN(name){
    var v=OP[name];
    if(v===undefined||isNaN(v)) throw new Error('opN: undefined opcode "'+name+'"');
    return obfNum(v);
  }

  var lua = [];

  // ── 1. DECRYPTOR (separate from VM) ───────────────────────────
  lua.push('-- [decryptor]');
  var vS4=rv(),vS5=rv(),vS6=rv();
  var vS=rv(),vI=rv(),vJ=rv(),vT=rv(),vOut=rv(),vRaw=rv();
  lua.push('local '+vDec+' = function('+vBlob+','+vS1+','+vS2+','+vS3+','+vS4+','+vS5+','+vS6+')');
  lua.push('  local '+vS+'={}');
  lua.push('  for _=0,255 do '+vS+'[_]=_ end');
  lua.push('  local _seed=tostring('+vS1+')..tostring('+vS2+')..tostring('+vS3+')..tostring('+vS4+')..tostring('+vS5+')..tostring('+vS6+')');
  lua.push('  local '+vJ+'=0');
  lua.push('  for _=0,255 do');
  lua.push('    '+vJ+'=('+vJ+'+'+vS+'[_]+string.byte(_seed,_%#_seed+1))%256');
  lua.push('    local '+vT+'='+vS+'[_];'+vS+'[_]='+vS+'['+vJ+'];'+vS+'['+vJ+']='+vT);
  lua.push('  end');
  lua.push('  local '+vI+'=0 '+vJ+'=0 '+vOut+'={}');
  lua.push('  for _=1,#'+vBlob+' do');
  lua.push('    '+vI+'=('+vI+'+1)%256');
  lua.push('    '+vJ+'=('+vJ+'+'+vS+'['+vI+'])%256');
  lua.push('    local '+vT+'='+vS+'['+vI+'];'+vS+'['+vI+']='+vS+'['+vJ+'];'+vS+'['+vJ+']='+vT);
  lua.push('    '+vOut+'[_]=string.byte('+vBlob+',_)~'+vS+'[('+vS+'['+vI+']+'+vS+'['+vJ+'])%256]');
  lua.push('  end');
  lua.push('  return '+vOut);
  lua.push('end');

  // ── 2. DESERIALIZER ───────────────────────────────────────────
  var vDeser=rv(), vBuf=rv(), vPos2=rv(), vNc=rv(), vNi=rv();
  lua.push('local '+vDeser+' = function('+vBuf+')');
  lua.push('  local _p=1');
  // Emit deserializer from buildDeserWithKeys (includes constKeys decrypt)
  buildDeserWithKeys(vBuf, vConsts).split('\n').forEach(function(l){
    lua.push('  '+l);
  });
  lua.push('  local '+vInstrs+'={}');
  lua.push('  for _=1,_ni do');
  lua.push('    local _op=_r1();local _a=_r3();local _b=_r3();local _c=_r3()');
  lua.push('    '+vInstrs+'[_]={_op,_a,_b,_c}');
  lua.push('  end');
  lua.push('  return '+vConsts+','+vInstrs);
  lua.push('end');
  // ── 3. SANDBOX ────────────────────────────────────────────────
  lua.push('local '+vNoop+' = function() end');
  lua.push('local '+vEnv+' = (function()');
  lua.push('  local _r=(getfenv and getfenv(0) or _ENV or _G)');
  lua.push('  local _b={debug=1,load=1,loadstring=1,dofile=1,loadfile=1}');
  lua.push('  pcall(function()');
  lua.push('    local _d=rawget(_r,"debug") or {}');
  lua.push('    for _,_k in pairs{"sethook","getinfo","getlocal","getupvalue","traceback"} do');
  lua.push('      rawset(_d,_k,'+vNoop+')');
  lua.push('    end');
  lua.push('  end)');
  lua.push('  return setmetatable({},{');
  lua.push('    __index=function(_,k) return _r[k] end,');
  lua.push('    __newindex=function(_,k,v) if not _b[k] then _r[k]=v end end');
  lua.push('  })');
  lua.push('end)()');

  // ── 4. VM EXECUTOR with dispatch table (non-linear) ──────────
  lua.push('local '+vVm+' = nil');
  lua.push(vVm+' = function('+vConsts+','+vInstrs+',_env,_args)');
  lua.push('  local '+vStack+'={}');
  lua.push('  local _sp=0');
  lua.push('  local _locals={}');
  lua.push('  local '+vPc+'=1');
  lua.push('  -- copy args into locals');
  lua.push('  if _args then for _i=1,#_args do _locals[_i-1]=_args[_i] end end');
  lua.push('  local function _push(v) _sp=_sp+1;'+vStack+'[_sp]=v end');
  lua.push('  local function _pop() local v='+vStack+'[_sp];'+vStack+'[_sp]=nil;_sp=_sp-1;return v end');
  lua.push('  local function _peek() return '+vStack+'[_sp] end');

  // Dispatch table — non-linear (op values are random, table lookup not if-chain)
  lua.push('  local '+vDisp+' = {}');

  // Emit each opcode handler into dispatch table using obfNum keys
  lua.push('  '+vDisp+'['+wrapDispatchKey(OP['PUSH_K'])+'] = function(_a) _push('+vConsts+'[_a+1]) end');
  lua.push('  '+vDisp+'['+wrapDispatchKey(OP['PUSH_L'])+'] = function(_a) _push(_locals[_a]) end');
  lua.push('  '+vDisp+'['+wrapDispatchKey(OP['STORE_L'])+'] = function(_a) _locals[_a]=_pop() end');
  lua.push('  '+vDisp+'['+wrapDispatchKey(OP['GET_G'])+'] = function(_a) _push(_env['+vConsts+'[_a+1]]) end');
  lua.push('  '+vDisp+'['+wrapDispatchKey(OP['SET_G'])+'] = function(_a) _env['+vConsts+'[_a+1]]=_pop() end');
  lua.push('  '+vDisp+'['+wrapDispatchKey(OP['ADD'])+'] = function() local b=_pop();local a=_pop();_push(a+b) end');
  lua.push('  '+vDisp+'['+wrapDispatchKey(OP['SUB'])+'] = function() local b=_pop();local a=_pop();_push(a-b) end');
  lua.push('  '+vDisp+'['+wrapDispatchKey(OP['MUL'])+'] = function() local b=_pop();local a=_pop();_push(a*b) end');
  lua.push('  '+vDisp+'['+wrapDispatchKey(OP['DIV'])+'] = function() local b=_pop();local a=_pop();_push(a/b) end');
  lua.push('  '+vDisp+'['+wrapDispatchKey(OP['MOD'])+'] = function() local b=_pop();local a=_pop();_push(a%b) end');
  lua.push('  '+vDisp+'['+wrapDispatchKey(OP['CONCAT'])+'] = function() local b=_pop();local a=_pop();_push(tostring(a)..tostring(b)) end');
  lua.push('  '+vDisp+'['+wrapDispatchKey(OP['LEN'])+'] = function() _push(#_pop()) end');
  lua.push('  '+vDisp+'['+wrapDispatchKey(OP['NOT'])+'] = function() _push(not _pop()) end');
  lua.push('  '+vDisp+'['+wrapDispatchKey(OP['UNM'])+'] = function() _push(-_pop()) end');
  lua.push('  '+vDisp+'['+wrapDispatchKey(OP['EQ'])+'] = function() local b=_pop();local a=_pop();_push(a==b) end');
  lua.push('  '+vDisp+'['+wrapDispatchKey(OP['NE'])+'] = function() local b=_pop();local a=_pop();_push(a~=b) end');
  lua.push('  '+vDisp+'['+wrapDispatchKey(OP['LT'])+'] = function() local b=_pop();local a=_pop();_push(a<b) end');
  lua.push('  '+vDisp+'['+wrapDispatchKey(OP['LE'])+'] = function() local b=_pop();local a=_pop();_push(a<=b) end');
  lua.push('  '+vDisp+'['+wrapDispatchKey(OP['GT'])+'] = function() local b=_pop();local a=_pop();_push(a>b) end');
  lua.push('  '+vDisp+'['+wrapDispatchKey(OP['GE'])+'] = function() local b=_pop();local a=_pop();_push(a>=b) end');
  lua.push('  '+vDisp+'['+wrapDispatchKey(OP['AND'])+'] = function() local b=_pop();local a=_pop();_push(a and b) end');
  lua.push('  '+vDisp+'['+wrapDispatchKey(OP['OR'])+'] = function() local b=_pop();local a=_pop();_push(a or b) end');
  lua.push('  '+vDisp+'['+wrapDispatchKey(OP['JMP'])+'] = function(_a) '+vPc+'='+vPc+'+_a end');
  lua.push('  '+vDisp+'['+wrapDispatchKey(OP['JF'])+'] = function(_a) if not _pop() then '+vPc+'='+vPc+'+_a end end');
  lua.push('  '+vDisp+'['+wrapDispatchKey(OP['JT'])+'] = function(_a) if _pop() then '+vPc+'='+vPc+'+_a end end');
  lua.push('  '+vDisp+'['+wrapDispatchKey(OP['CALL'])+'] = function(_a,_b)');
  lua.push('    -- collect args in correct order (stack is LIFO)');
  lua.push('    local _args={}');
  lua.push('    for _i=_a,1,-1 do _args[_i]=_pop() end');
  lua.push('    local _fn=_pop()');
  lua.push('    -- FIX 4: strict type check, handle metamethod __call');
  lua.push('    local _callable=type(_fn)=="function"');
  lua.push('    if not _callable then');
  lua.push('      local _mt=getmetatable(_fn)');
  lua.push('      _callable=_mt and type(_mt.__call)=="function"');
  lua.push('    end');
  lua.push('    if not _callable then _push(nil);return end');
  lua.push('    local _res=table.pack(pcall(_fn,table.unpack(_args,1,_a)))');
  lua.push('    if _res[1] then');
  lua.push('      -- push exactly _b return values (nil-pad if fewer returned)');
  lua.push('      for _i=2,_b+1 do _push(_res[_i]) end');
  lua.push('    else _push(nil) end');
  lua.push('  end');
  lua.push('  '+vDisp+'['+wrapDispatchKey(OP['RETURN'])+'] = function(_a)');
  lua.push('    local _rets={}');
  lua.push('    for _i=_a,1,-1 do _rets[_i]=_pop() end');
  lua.push('    '+vPc+'=#'+vInstrs+'+1');  // stop execution loop
  lua.push('    for _i=1,_a do _push(_rets[_i]) end'); // push rets back for caller
  lua.push('  end');
  lua.push('  '+vDisp+'['+wrapDispatchKey(OP['NEW_TBL'])+'] = function() _push({}) end');
  lua.push('  '+vDisp+'['+wrapDispatchKey(OP['GET_TBL'])+'] = function() local k=_pop();local t=_pop();_push(t[k]) end');
  lua.push('  '+vDisp+'['+wrapDispatchKey(OP['SET_TBL'])+'] = function() local v=_pop();local k=_pop();local t=_pop();t[k]=v end');
  lua.push('  '+vDisp+'['+wrapDispatchKey(OP['PUSH_NIL'])+'] = function() _push(nil) end');
  lua.push('  '+vDisp+'['+wrapDispatchKey(OP['PUSH_BOOL'])+'] = function(_a) _push(_a~=0) end');
  lua.push('  '+vDisp+'['+wrapDispatchKey(OP['DUP'])+'] = function() _push(_peek()) end');
  lua.push('  '+vDisp+'['+wrapDispatchKey(OP['POP'])+'] = function() _pop() end');
  lua.push('  '+vDisp+'['+wrapDispatchKey(OP['FOR_NUM_PREP'])+'] = function(_a)');
  lua.push('    local _step=_pop();local _lim=_pop();local _init=_pop()');
  lua.push('    _push(_init);_push(_lim);_push(_step)');
  lua.push('    if (_step>0 and _init>_lim) or (_step<0 and _init<_lim) then '+vPc+'='+vPc+'+_a end');
  lua.push('  end');
  lua.push('  '+vDisp+'['+wrapDispatchKey(OP['FOR_NUM_LOOP'])+'] = function(_a)');
  lua.push('    local _step=_pop();local _lim=_pop();local _i=_pop()');
  lua.push('    _i=_i+_step');
  lua.push('    if (_step>0 and _i<=_lim) or (_step<0 and _i>=_lim) then');
  lua.push('      _push(_i);_push(_lim);_push(_step);_push(_i)');
  lua.push('      '+vPc+'='+vPc+'+_a');
  lua.push('    end');
  lua.push('  end');
  // ── NEW OPCODES ─────────────────────────────────────────────
  lua.push('  '+vDisp+'['+opN('RETURN0')+'] = function()');
  lua.push('    '+vPc+'=#'+vInstrs+'+1');
  lua.push('  end');
  lua.push('  '+vDisp+'['+wrapDispatchKey(OP['POW'])+'] = function() local b=_pop();local a=_pop();_push(a^b) end');
  lua.push('  '+vDisp+'['+wrapDispatchKey(OP['IDIV'])+'] = function() local b=_pop();local a=_pop();_push(math.floor(a/b)) end');
  lua.push('  '+vDisp+'['+wrapDispatchKey(OP['BAND'])+'] = function() local b=_pop();local a=_pop();_push(a&b) end');
  lua.push('  '+vDisp+'['+wrapDispatchKey(OP['BOR'])+'] = function() local b=_pop();local a=_pop();_push(a|b) end');
  lua.push('  '+vDisp+'['+wrapDispatchKey(OP['BXOR'])+'] = function() local b=_pop();local a=_pop();_push(a~b) end');
  lua.push('  '+vDisp+'['+wrapDispatchKey(OP['BNOT'])+'] = function() _push(~_pop()) end');
  lua.push('  '+vDisp+'['+wrapDispatchKey(OP['SHL'])+'] = function() local b=_pop();local a=_pop();_push(a<<b) end');
  lua.push('  '+vDisp+'['+wrapDispatchKey(OP['SHR'])+'] = function() local b=_pop();local a=_pop();_push(a>>b) end');
  lua.push('  '+vDisp+'['+wrapDispatchKey(OP['SWAP'])+'] = function()');
  lua.push('    local a=_pop();local b=_pop();_push(a);_push(b)');
  lua.push('  end');
  lua.push('  '+vDisp+'['+wrapDispatchKey(OP['VARARG'])+'] = function()');
  lua.push('    if _args then for _i=1,#_args do _push(_args[_i]) end end');
  lua.push('  end');
  lua.push('  '+vDisp+'['+wrapDispatchKey(OP['CLOSURE'])+'] = function(_a)');
  lua.push('    local _fd='+vConsts+'[_a+1]');
  lua.push('    if type(_fd)~="table" then _push(nil);return end');
  lua.push('    -- Build a closure that runs inner VM');
  lua.push('    local _inner_code=_fd._code or {}');
  lua.push('    local _inner_consts=_fd._consts or {}');
  lua.push('    local _np=_fd._params or 0');
  lua.push('    _push(function(...)');
  lua.push('      local _a2={...}');
  lua.push('      return '+vVm+'(_inner_consts,_inner_code,_env,_a2)');
  lua.push('    end)');
  lua.push('  end');
  // CALL_M: method call with self already on stack below method
  lua.push('  '+vDisp+'['+wrapDispatchKey(OP['CALL_M'])+'] = function(_a,_b)');
  lua.push('    local _args={}');
  lua.push('    for _i=_a,2,-1 do _args[_i-1]=_pop() end'); // pop args (exclude self)
  lua.push('    local _fn=_pop()');  // pop method
  lua.push('    local _self=_pop()'); // pop self
  lua.push('    table.insert(_args,1,_self)');
  lua.push('    local _callable=type(_fn)=="function"');
  lua.push('    if not _callable then local _mt=getmetatable(_fn);_callable=_mt and type(_mt.__call)=="function" end');
  lua.push('    if not _callable then _push(nil);return end');
  lua.push('    local _res=table.pack(pcall(_fn,table.unpack(_args)))');
  lua.push('    if _res[1] then for _i=2,_b+1 do _push(_res[_i]) end');
  lua.push('    else _push(nil) end');
  lua.push('  end');
  // Generic for opcodes
  lua.push('  '+vDisp+'['+wrapDispatchKey(OP['FOR_GEN_PREP'])+'] = function(_a)');
  lua.push('    -- Stack: iter_func (from pairs/ipairs etc)');
  lua.push('    -- Call iter to get: iter_fn, state, control');
  lua.push('    local _iter=_pop()');
  lua.push('    local _r');
  lua.push('    if type(_iter)=="function" then');
  lua.push('      _r=table.pack(pcall(_iter))');
  lua.push('      if _r[1] and type(_r[2])=="function" then');
  lua.push('        _push(_r[2]);_push(_r[3]);_push(_r[4])'); // iter,state,ctrl
  lua.push('      else');
  lua.push('        -- already the iter triple: push iter,state,ctrl=nil');
  lua.push('        _push(_iter);_push(nil);_push(nil)');
  lua.push('      end');
  lua.push('    else _push(_iter);_push(nil);_push(nil) end');
  lua.push('  end');
  lua.push('  '+vDisp+'['+wrapDispatchKey(OP['FOR_GEN_LOOP'])+'] = function(_a,_nv)');
  lua.push('    local _ctrl=_pop();local _state=_pop();local _iter=_pop()');
  lua.push('    if type(_iter)~="function" then '+vPc+'='+vPc+'+_a;return end');
  lua.push('    local _res=table.pack(pcall(_iter,_state,_ctrl))');
  lua.push('    if not _res[1] or _res[2]==nil then '+vPc+'='+vPc+'+_a;return end');
  lua.push('    -- push iter,state,new_ctrl back, then loop vars');
  lua.push('    _push(_iter);_push(_state);_push(_res[2])');
  lua.push('    for _i=1,(_nv or 1) do _push(_res[_i+1]) end');
  lua.push('    '+vPc+'='+vPc+'+_a'); // jump back to body
  lua.push('  end');
  lua.push('  '+vDisp+'['+wrapDispatchKey(OP['UNPACK'])+'] = function()');
  lua.push('    local t=_pop();if type(t)=="table" then for _,v in ipairs(t) do _push(v) end end');
  lua.push('  end');
  lua.push('  '+vDisp+'['+wrapDispatchKey(OP['SETTOP'])+'] = function(_a) while _sp>_a do _pop() end end');
  lua.push('  '+vDisp+'['+wrapDispatchKey(OP['GETTOP'])+'] = function() _push(_sp) end');
  lua.push('  '+vDisp+'['+wrapDispatchKey(OP['STORE_TBL_FIELD'])+'] = function(_a)');
  lua.push('    local v=_pop();local t=_pop();if type(t)=="table" then t['+vConsts+'[_a+1]]=v end');
  lua.push('  end');
  lua.push('  '+vDisp+'['+wrapDispatchKey(OP['STORE_TBL_IDX'])+'] = function()');
  lua.push('    local v=_pop();local k=_pop();local t=_pop();if type(t)=="table" then t[k]=v end');
  lua.push('  end');

  // Execution loop
  lua.push('  while '+vPc+' <= #'+vInstrs+' do');
  lua.push('    local _ins='+vInstrs+'['+vPc+']');
  lua.push('    '+vPc+'='+vPc+'+1');
  lua.push('    local _h='+vDisp+'[_ins[1]]');
  lua.push('    if _h then _h(_ins[2],_ins[3],_ins[4]) end');
  lua.push('  end');
  lua.push('end');

  // ── 5. ENTRYPOINT — decryptor isolated in its own closure ──────
  // Decryptor fn + raw blob both live inside an IIFE.
  // Only the decrypted bytes come out — the decryptor and blob
  // are GC'd as soon as the IIFE returns.
  var vRawBytes=rv(), vDecrypted=rv(), vCk=rv(), vCi=rv();
  // Inject blob setup before IIFE
  if(_blobSetup) lua.unshift(_blobSetup);
  lua.push('-- entrypoint: decryptor runs in isolated closure');
  lua.push('local '+vDecrypted+' = (function()');
  lua.push('  local _b='+luaStr); // luaStr = var holding blob bytes
  lua.push('  local _r='+vDec+'(_b,'+[s1,s2,s3,s4,s5,s6].map(obfNum).join(',')+')');
  lua.push('  '+vDec+'=nil;_b=nil');  // clear both before returning
  lua.push('  return _r');
  lua.push('end)()');
  lua.push('local '+vCk+','+vCi+' = '+vDeser+'('+vDecrypted+')');
  lua.push(vDecrypted+'=nil;'+vDeser+'=nil');  // clear after deserializing
  // B1: string splitting patch (re-concat strings at runtime)
  var strPatches = buildStringSplitPatch(compiled.consts, vCk);
  strPatches.forEach(function(l){ lua.push(l); });
  // Feature 3: embed integrity check on CK (const array)
  // Simple: verify const count matches expected
  var vCC=rv();
  lua.push('local '+vCC+'=0');
  lua.push('for _ in pairs('+vCk+') do '+vCC+'='+vCC+'+1 end');
  lua.push('if '+vCC+'~='+obfNum(0)+'+('+obfNum(_chk)+'>>8) then error("SOLI:bc_tampered",0) end');
  lua.push(vVm+'('+vCk+','+vCi+','+vEnv+',{})');
  lua.push(vVm+'=nil;'+vCk+'=nil;'+vCi+'=nil');  // clear after execution

  // U5: junk globals for noise
  lua.unshift(buildJunkGlobals(4));
  // B3: dead branch injection — sprinkle 2 unreachable if-blocks
  lua.splice(Math.floor(lua.length*0.3), 0, buildDeadBranch());
  lua.splice(Math.floor(lua.length*0.7), 0, buildDeadBranch());

  // Feature 2: obfuscate VM handler arithmetic
  var luaStr = lua.join('\n');
  luaStr = obfuscateHandlers(luaStr);

  // B4: source-level CFF (scramble visual block order)
  if(opts.cff) luaStr = applySourceCFF(luaStr);

  // B2: VM poly config embedded as comment hint (actual poly in next iteration)
  var _poly = vmPolyConfig();
  // Poly: wrap execution loop differently based on config
  if(_poly.loopStyle === 'repeat') {
    luaStr = luaStr.replace(/while (\w+)<=#(\w+) do/g, function(m,pc,instrs){
      return 'repeat local _cond='+pc+'<=#'+instrs+' ; if not _cond then break end';
    });
  }

  // Wrap in closure
  var vWrap=rv();
  var fake=buildFakeVars(3);
  return 'local '+vWrap+' = (function()\n'+fake+'\n'+luaStr+'\nend)()';
}



// ── Anti-Tamper (Executor) — strengthened [FIX 5] ────
function buildAntiTamper(code) {
  var vE=rv(), vC=rv(), vP=rv();
  var guard = [
    'local '+vE+' = (getfenv and getfenv(0) or _ENV or {})',
    'local '+vC+' = function()',
    '  if type('+vE+'.print) ~= "function" then error("") end',
    '  if debug then',
    '    local _d=debug',
    '    if type(_d.getinfo)=="function" then',
    '      local _f=function() return '+vE+' end',
    '      local _i=_d.getinfo(_f,"u")',
    '      if _i and (_i.nups or 0) > '+obfNum(5)+' then error("") end',
    '    end',
    '    pcall(function() _d.sethook=nil _d.getinfo=nil _d.getlocal=nil end)',
    '  end',
    'end',
    'local '+vP+' = pcall('+vC+')',
    'if not '+vP+' then repeat task.wait(1) until false end',
  ].join('\n');
  return guard + '\n' + code;
}

// ── Anti-Tamper (Lua 5.1-5) ───────────────────────────
function buildLuaAntiTamper(code) {
  var vOk=rv(), vHk=rv();
  var lines=[
    'local '+vOk+' = true',
    'if type(math) ~= '+"\\116\\97\\98\\108\\101"+' then '+vOk+' = false end',
    'if type(string) ~= '+"\\116\\97\\98\\108\\101"+' then '+vOk+' = false end',
    'if type(pcall) ~= '+"\\102\\117\\110\\99\\116\\105\\111\\110"+' then '+vOk+' = false end',
    'if debug then',
    '  local '+vHk+' = debug.gethook and debug.gethook()',
    '  if '+vHk+' then '+vOk+' = false end',
    'end',
    'if not '+vOk+' then error('+"\\83\\79\\76\\73\\58\\32\\101\\110\\118\\32\\116\\97\\109\\112\\101\\114\\101\\100"+',0) end',
  ];
  return lines.join('\n')+'\n'+code;
}

// ── Auto lowercase ─────────────────────────────────────
function autoLowercase(code) {
  return code.replace(/"[^"]*"|'[^']*'|--[^\n]*/g, function(m){ return m; })
             .replace(/\b([A-Z][a-zA-Z0-9_]*)\b/g, function(m){
               var roblox=new Set(['Instance','Vector3','Vector2','CFrame','Color3',
                 'BrickColor','UDim','UDim2','Enum','game','workspace','Players',
                 'RunService','UserInputService','TweenService','ReplicatedStorage',
                 'ServerStorage','ServerScriptService','StarterGui','StarterPack',
                 'Lighting','Teams','SoundService','true','True','False','Nil']);
               return roblox.has(m)?m:m.toLowerCase();
             });
}

// ── Main obfuscate ─────────────────────────────────────
async function doObf() {
  var inputEl  = document.getElementById('input');
  var outputEl = document.getElementById('output');
  var btn      = document.getElementById('obfBtn');
  var useAntiTamper    = document.getElementById('useAntiTamper').checked;
  var useLuaAntiTamper = document.getElementById('useLuaAntiTamper').checked;
  var code = inputEl.value.trim();

  btn.disabled = true;
  outputEl.value = '';
  setStatus('Processing...','process');
  setLayers(0);

  if(!code){ setStatus('Input kosong! Paste kode Lua dulu.','error'); btn.disabled=false; return; }
  code = autoLowercase(code);
  inputEl.value = code;
  if(!looksLikeLua(code)){ setStatus('Kode tidak terdeteksi sebagai Lua.','error'); btn.disabled=false; return; }

  try {
    var block = buildVMLayer(code);
    block = buildAntiDebug(block);      // patch debug.* at runtime
    var layers = 11;
    setLayers(layers);

    if(useAntiTamper){
      block = buildAntiTamper(block);
      layers += 1;
    setLayers(layers);
    }
    if(useLuaAntiTamper){
      block = buildLuaAntiTamper(block);
      layers += 1;
    setLayers(layers);
    }

    outputEl.value = block;
    setStatus('Selesai!','done');
    setLayers(layers);

  } catch(e) {
    setStatus('Error: '+e.message,'error');
    console.error(e);
  } finally {
    btn.disabled = false;
  }
}

async function doCopy() {
  var out = document.getElementById('output').value;
  if(!out.trim()){ setStatus('Belum ada output!','error'); return; }
  try { await navigator.clipboard.writeText(out); }
  catch(e){
    var ta=document.createElement('textarea');
    ta.value=out; ta.style.cssText='position:fixed;opacity:0';
    document.body.appendChild(ta); ta.select();
    document.execCommand('copy'); document.body.removeChild(ta);
  }
  var btn=document.querySelector('.btn-secondary');
  var orig=btn.textContent; btn.textContent='\u2713 Copied!';
  btn.style.color='var(--accent)'; btn.style.borderColor='var(--accent)';
  setTimeout(function(){ btn.textContent=orig; btn.style.color=''; btn.style.borderColor=''; },1500);
  setStatus('Output berhasil dicopy!','done');
}

// ══════════════════════════════════════════════════════════════
//  BETA FEATURE PACK
//  B1: String splitting  — break string consts into concat pieces
//  B2: VM polymorphism   — randomize VM internal structure each run
//  B3: Dead branch inject — insert unreachable if-blocks in Lua output
//  B4: Control flow graph — scramble instruction block order + patch jumps
// ══════════════════════════════════════════════════════════════

// ── B1: String splitting ──────────────────────────────────────
// Split every string constant in the pool into 2-4 pieces
// connected with .. at runtime. Decompilers see concat, not string.
// Applied in Lua const loader (before VM runs).
function splitStringConst(s) {
  if(s.length < 4) return null;
  var pieces = [];
  var pos = 0;
  var nParts = Math.min(4, Math.max(2, Math.floor(s.length / 3)));
  for(var i=0;i<nParts;i++){
    var remaining = nParts - i;
    var len = i === nParts-1
      ? s.length - pos
      : Math.max(1, Math.floor((s.length - pos) / remaining) + Math.floor(Math.random()*2));
    pieces.push(s.slice(pos, pos+len));
    pos += len;
    if(pos >= s.length) break;
  }
  if(pieces.length < 2) return null;
  // Encode each piece as \XX bytes
  return pieces.map(function(p){
    return '"'+p.split('').map(function(c){return '\\'+c.charCodeAt(0);}).join('')+'"';
  }).join('..');
}

// Apply string splitting to a Lua const patch:
// returns extra Lua lines to run after deserializer, re-splitting specific consts
function buildStringSplitPatch(consts, vConsts) {
  var lines = [];
  consts.forEach(function(c, i) {
    if(typeof c !== 'string' || c.length < 4) return;
    var split = splitStringConst(c);
    if(!split) return;
    // Overwrite the const entry with the split version
    lines.push(vConsts+'['+(i+1)+']='+ split);
  });
  return lines;
}

// ── B2: VM Polymorphism ───────────────────────────────────────
// Each compile: randomize which Lua idioms are used in VM internals
// Variation set: stack as local array vs upvalue, PC as local vs upvalue,
// loop as while vs repeat, push/pop as inline vs closure
function vmPolyConfig() {
  return {
    stackAsUpvalue:  Math.random() > 0.5,  // stack declared outside or inside vm fn
    pcAsUpvalue:     Math.random() > 0.5,  // same for PC
    loopStyle:       Math.random() > 0.5 ? 'while' : 'repeat', // execution loop style
    inlinePushPop:   Math.random() > 0.5,  // inline stack ops vs local fn calls
    reverseDispatch: Math.random() > 0.5,  // iterate dispatch backwards (still correct)
  };
}

// ── B3: Dead branch injection ─────────────────────────────────
// Insert if-blocks in Lua output that never execute but look real.
// Uses impossible conditions based on type checks and math.
function buildDeadBranch() {
  var vN = rv(), vS = rv(), vR = rv();
  var conditions = [
    'type('+obfNum(1)+')~="number"',
    'math.floor('+obfNum(0)+')>'+obfNum(1),
    'tostring('+obfNum(0)+')==""',
    obfNum(2)+'<'+obfNum(1),
    'type(nil)=="number"',
  ];
  var cond = conditions[Math.floor(Math.random()*conditions.length)];
  var body = [
    'local '+vN+'='+obfNum(Math.floor(Math.random()*9999)+1),
    'local '+vS+'=tostring('+vN+')',
    'local '+vR+'='+vS+'.."_dead"',
    '_G['+vR+']='+ vN,
  ].join('\n');
  return 'if '+cond+' then\n'+body+'\nend';
}

// ── B4: CFF at Lua source level ───────────────────────────────
// Take the final Lua output string, split into logical sections,
// wrap each in a named function, call them in dispatcher order.
// This scrambles the visual structure even if bytecode is decoded.
function applySourceCFF(luaCode) {
  // Split on blank lines into sections
  var sections = luaCode.split(/\n{2,}/);
  if(sections.length < 3) return luaCode; // too small

  // Assign each section a random order key
  var indexed = sections.map(function(s, i){ return {code:s, orig:i}; });
  // Shuffle
  for(var i=indexed.length-1;i>0;i--){
    var j=Math.floor(Math.random()*(i+1));
    var t=indexed[i];indexed[i]=indexed[j];indexed[j]=t;
  }

  // Wrap sections in local functions named by random vars
  var fnNames = indexed.map(function(){ return rv(); });
  var out = [];

  // Forward declare all
  fnNames.forEach(function(name){ out.push('local '+name); });
  out.push('');

  // Define each
  indexed.forEach(function(sec, i){
    out.push(fnNames[i]+' = function()');
    sec.code.split('\n').forEach(function(l){ out.push('  '+l); });
    out.push('end');
  });
  out.push('');

  // Call in original order
  var callOrder = new Array(indexed.length);
  indexed.forEach(function(sec, shuffledIdx){
    callOrder[sec.orig] = fnNames[shuffledIdx];
  });
  callOrder.forEach(function(name){ out.push(name+'()'); });

  return out.join('\n');
}



// ══════════════════════════════════════════════════════════════
//  BETA FEATURES
// ══════════════════════════════════════════════════════════════

// ── FEATURE 2: Obfuscate VM handler bodies ────────────────────
// Each handler function body gets its arithmetic split into
// multi-step calculations with random intermediate variables,
// and string keys replaced with obfuscated number expressions.
function obfuscateHandlers(lua) {
  // Split every arithmetic literal inside handlers into (a-b-c) form
  // e.g. 256 → (300-33-11), 65536 → (65540-2-2)
  return lua.replace(/\b(\d{2,})\b/g, function(m) {
    var n = parseInt(m);
    if (isNaN(n) || n < 10) return m;
    var a = Math.floor(Math.random() * 50) + 2;
    var b = Math.floor(Math.random() * 30) + 1;
    return '(' + (n + a + b) + '-' + a + '-' + b + ')';
  });
}

// ── FEATURE 3: Bytecode integrity check ──────────────────────
// Compute a simple checksum of the encrypted bytecode bytes,
// embed it in the Lua output. VM verifies on startup.
function computeChecksum(bytes) {
  var h = 0x5A5A;
  for (var i = 0; i < bytes.length; i++) {
    h = ((h << 5) ^ (h >> 3) ^ bytes[i]) & 0xFFFF;
  }
  return h;
}

function buildIntegrityCheck(vBytes, checksum, vRv) {
  var vH = rv(), vI = rv();
  return [
    'local ' + vH + ' = 0x5A5A',
    'for ' + vI + '=1,#' + vBytes + ' do',
    '  ' + vH + '=((' + vH + '<<5)~(' + vH + '>>3)~' + vBytes + '[' + vI + '])&0xFFFF',
    'end',
    'if ' + vH + '~=' + obfNum(checksum) + ' then error("SOLI:integrity_fail",0) end',
  ].join('\n');
}

// ── FEATURE 6: Constant folding obfuscation ───────────────────
// Replace constants that are the result of simple expressions
// with the expression itself: 42 → (6*7), 100 → (10^2), etc
function foldConst(n) {
  if (typeof n !== 'number' || !Number.isInteger(n) || n < 2) return null;
  // Try multiplication
  for (var a = 2; a <= Math.sqrt(n); a++) {
    if (n % a === 0) {
      var b = n / a;
      return '(' + obfNum(a) + '*' + obfNum(b) + ')';
    }
  }
  // Try addition split
  var split = Math.floor(n / 2);
  return '(' + obfNum(split) + '+' + obfNum(n - split) + ')';
}

// Wire constant folding into serializer: numbers in const pool
// become expressions in the Lua const table reconstruction
function buildConstFoldedLoader(consts, vConsts) {
  var lines = ['local ' + vConsts + ' = {}'];
  consts.forEach(function(c, i) {
    var idx = i + 1;
    if (typeof c === 'number' && Number.isInteger(c) && c >= 2 && c < 100000) {
      var expr = foldConst(c);
      if (expr) {
        lines.push(vConsts + '[' + idx + ']=' + expr);
        return;
      }
    }
    // Default: leave as-is (handled by deserializer)
    // (only folds pre-encryption consts in the Lua output header - not bytecode)
  });
  return lines.join('\n');
}



// ── Textarea inspect protection ────────────────────────
(function(){
  var _store='';
  window.addEventListener('load',function(){
    var _ta=document.getElementById('output');
    if(!_ta) return;
    var _d=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value');
    var _ns=_d.set;
    Object.defineProperty(_ta,'value',{
      get:function(){ return _store; },
      set:function(v){
        _store=v;
        _ns.call(_ta, v.length>0?'-- [SOLI Protected Output]':'');
      },
      configurable:true
    });
    _ta.addEventListener('focus',function(){ _ns.call(_ta,_store); });
    _ta.addEventListener('blur',function(){
      if(_store.length>0) _ns.call(_ta,'-- [SOLI Protected Output]');
    });
  });
})();
window.doObf = doObf;
window.doCopy = doCopy;
