var HackgorithmicScene=(function(e){Object.defineProperty(e,Symbol.toStringTag,{value:`Module`});var t=`canvas[data-shader-scene]`,n=[`lime`,`pearl`,`ember`],r=new Map,i=54e4,a=1280,o=1e3/30,s,c=!1,l=`
attribute vec2 aPosition;
void main() { gl_Position = vec4(aPosition, 0.0, 1.0); }
`,u=`
precision highp float;
uniform vec2 uResolution;
uniform vec2 uPointer;
uniform float uTime;
uniform float uTheme;

mat2 rotation(float a) {
  float s = sin(a), c = cos(a);
  return mat2(c, -s, s, c);
}

vec3 objectPoint(vec3 p) {
  p.xz *= rotation(uTime * 0.16 + 0.28 + uPointer.x * 0.18);
  p.yz *= rotation(0.90 + sin(uTime * 0.22) * 0.11 + uPointer.y * 0.14);
  p.xy *= rotation(-0.28 + sin(uTime * 0.12) * 0.09);
  return p;
}

float shape(vec3 world) {
  vec3 p = objectPoint(world);
  float angle = atan(p.z, p.x);
  float wave = sin(angle * 3.0) * 0.11;
  float radius = 0.91 + cos(angle * 3.0) * 0.055;
  vec2 ring = vec2(length(p.xz) - radius, p.y - wave);
  // Fine ridges evoke printed layers without a texture download.
  float grooves = sin(angle * 72.0) * 0.006 + sin(p.y * 103.0) * 0.003;
  return length(ring) - 0.335 + grooves;
}

vec3 surfaceNormal(vec3 p) {
  vec2 e = vec2(0.0013, -0.0013);
  return normalize(e.xyy * shape(p + e.xyy) + e.yyx * shape(p + e.yyx)
    + e.yxy * shape(p + e.yxy) + e.xxx * shape(p + e.xxx));
}

vec3 material(vec3 normal, float facing) {
  float band = 0.5 + 0.5 * sin(normal.x * 3.6 + normal.y * 4.0 + facing * 5.0);
  vec3 colorA = vec3(0.59, 0.90, 0.22);
  vec3 colorB = vec3(0.17, 0.73, 0.73);
  vec3 colorC = vec3(0.88, 0.94, 0.70);
  if (uTheme > 0.5 && uTheme < 1.5) {
    colorA = vec3(0.83, 0.86, 0.94);
    colorB = vec3(0.57, 0.63, 0.84);
    colorC = vec3(0.89, 0.71, 0.82);
  } else if (uTheme > 1.5) {
    colorA = vec3(0.98, 0.54, 0.22);
    colorB = vec3(0.69, 0.22, 0.26);
    colorC = vec3(1.0, 0.85, 0.58);
  }
  return mix(mix(colorA, colorB, band * 0.68), colorC, pow(1.0 - facing, 2.0) * 0.74);
}

float random(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

void main() {
  vec2 uv = (gl_FragCoord.xy * 2.0 - uResolution.xy) / min(uResolution.x, uResolution.y);
  vec3 origin = vec3(0.0, 0.06, 3.8);
  vec3 ray = normalize(vec3(uv * 0.93, -2.75));
  vec3 background = vec3(0.017, 0.021, 0.019);
  float halo = exp(-dot(uv * vec2(0.78, 1.0), uv * vec2(0.78, 1.0)) * 1.45);
  vec3 haloColor = uTheme > 1.5 ? vec3(0.075, 0.026, 0.012)
    : uTheme > 0.5 ? vec3(0.030, 0.035, 0.065) : vec3(0.025, 0.053, 0.027);
  vec3 color = background + haloColor * halo;
  float distanceAlongRay = 1.9;
  float distanceToSurface = 1.0;
  for (int step = 0; step < 64; step++) {
    distanceToSurface = shape(origin + ray * distanceAlongRay);
    if (distanceToSurface < 0.0022 || distanceAlongRay > 5.5) break;
    distanceAlongRay += distanceToSurface * 0.82;
  }
  if (distanceToSurface < 0.0022 && distanceAlongRay <= 5.5) {
    vec3 point = origin + ray * distanceAlongRay;
    vec3 normal = surfaceNormal(point);
    vec3 light = normalize(vec3(-0.55, 0.95, 1.40));
    vec3 fillLight = normalize(vec3(0.90, -0.10, 0.65));
    vec3 view = -ray;
    float facing = max(dot(normal, view), 0.0);
    float diffuse = max(dot(normal, light), 0.0);
    float fill = max(dot(normal, fillLight), 0.0);
    float specular = pow(max(dot(normal, normalize(light + view)), 0.0), 62.0);
    float rim = pow(1.0 - facing, 3.0);
    vec3 base = material(normal, facing);
    color = base * (0.14 + diffuse * 0.83 + fill * 0.20);
    color += vec3(0.98, 0.99, 0.88) * specular * 0.77;
    color += base * rim * 0.38;
    color *= 0.88 + 0.12 * smoothstep(-0.8, 0.85, point.y);
    color = pow(max(color, vec3(0.0)), vec3(0.90));
  }
  color += (random(gl_FragCoord.xy) - 0.5) * 0.006;
  gl_FragColor = vec4(color, 1.0);
}
`;function d(e,t,n){let r=e.createShader(t);if(!r)throw Error(`Shader unavailable`);if(e.shaderSource(r,n),e.compileShader(r),!e.getShaderParameter(r,e.COMPILE_STATUS))throw e.deleteShader(r),Error(`Shader compilation unavailable`);return r}function f(e){let t=e.getContext(`webgl`,{alpha:!1,antialias:!1,depth:!1,stencil:!1,preserveDrawingBuffer:!1,powerPreference:`low-power`});if(!t)return null;let r,i,a,o;try{let s=t.getShaderPrecisionFormat(t.FRAGMENT_SHADER,t.HIGH_FLOAT)?.precision?u:u.replace(`precision highp float;`,`precision mediump float;`);if(r=d(t,t.VERTEX_SHADER,l),i=d(t,t.FRAGMENT_SHADER,s),a=t.createProgram(),!a)throw Error(`Program unavailable`);if(t.attachShader(a,r),t.attachShader(a,i),t.linkProgram(a),!t.getProgramParameter(a,t.LINK_STATUS))throw Error(`Program linking unavailable`);if(t.useProgram(a),o=t.createBuffer(),!o)throw Error(`Buffer unavailable`);t.bindBuffer(t.ARRAY_BUFFER,o),t.bufferData(t.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),t.STATIC_DRAW);let c=t.getAttribLocation(a,`aPosition`);t.enableVertexAttribArray(c),t.vertexAttribPointer(c,2,t.FLOAT,!1,0,0);let f=t.getUniformLocation(a,`uResolution`),p=t.getUniformLocation(a,`uTime`),m=t.getUniformLocation(a,`uPointer`),h=t.getUniformLocation(a,`uTheme`);return e.dataset.shaderRenderer=`webgl`,{draw(r){t.viewport(0,0,e.width,e.height),t.uniform2f(f,e.width,e.height),t.uniform1f(p,r.time),t.uniform2f(m,r.pointer[0],r.pointer[1]),t.uniform1f(h,n.indexOf(r.theme)),t.drawArrays(t.TRIANGLES,0,3)},destroy(){t.deleteBuffer(o),t.deleteProgram(a),t.deleteShader(r),t.deleteShader(i)}}}catch(e){throw o&&t.deleteBuffer(o),a&&t.deleteProgram(a),r&&t.deleteShader(r),i&&t.deleteShader(i),e}}function p(e){let t=e.getContext(`2d`,{alpha:!1});if(e.dataset.shaderRenderer=`canvas2d`,!t)return e.style.background=`radial-gradient(ellipse at 50% 45%, #354b25 0%, #101910 42%, #060806 76%)`,{draw(){},destroy(){}};let n={lime:[[167,218,89],[78,181,187],[230,244,201]],pearl:[[213,219,238],[138,160,211],[245,204,225]],ember:[[247,147,79],[182,64,88],[255,226,157]]};function r(e,t,n,r,i,a){let o=t*Math.cos(r)-n*Math.sin(r),s=t*Math.sin(r)+n*Math.cos(r),c=e*Math.cos(i)+s*Math.sin(i),l=-e*Math.sin(i)+s*Math.cos(i);return[c*Math.cos(a)-o*Math.sin(a),c*Math.sin(a)+o*Math.cos(a),l]}return{draw(i){let a=e.width,o=e.height,s=Math.min(a,o),c=n[i.theme];t.fillStyle=`#060806`,t.fillRect(0,0,a,o);let l=t.createRadialGradient(a*.5,o*.46,0,a*.5,o*.46,s*.75);l.addColorStop(0,`rgba(${c[0].join(`,`)},.10)`),l.addColorStop(1,`rgba(0,0,0,0)`),t.fillStyle=l,t.fillRect(0,0,a,o);let u=.9+Math.sin(i.time*.22)*.11+i.pointer[1]*.14,d=i.time*.16+.28+i.pointer[0]*.18,f=-.28+Math.sin(i.time*.12)*.09,p=[],m=[];for(let e=0;e<=72;e++){let t=e/72*Math.PI*2,n=.91+Math.cos(t*3)*.055;for(let e=0;e<=20;e++){let i=e/20*Math.PI*2,c=n+.335*Math.cos(i),l=r(Math.cos(t)*c,.335*Math.sin(i)+Math.sin(t*3)*.11,Math.sin(t)*c,u,d,f),m=r(Math.cos(t)*Math.cos(i),Math.sin(i),Math.sin(t)*Math.cos(i),u,d,f),h=s*1.47/(3.8-l[2]);p.push({x:a*.5+l[0]*h,y:o*.5-l[1]*h,z:l[2],normal:m})}}for(let e=0;e<72;e++)for(let t=0;t<20;t++){let n=e*21+t,r=[p[n],p[n+1],p[n+20+2],p[n+20+1]];m.push({points:r,z:r.reduce((e,t)=>e+t.z,0)/4})}m.sort((e,t)=>e.z-t.z);for(let e of m){let n=e.points[0].normal,r=Math.max(0,n[2]),i=.5+.5*Math.sin(n[0]*3.6+n[1]*4+r*5),a=.22+Math.max(0,n[0]*-.3+n[1]*.53+n[2]*.79)*.86,o=(1-r)**2*.48,s=c[0].map((e,t)=>Math.min(255,Math.round(((e*(1-i*.68)+c[1][t]*i*.68)*(1-o)+c[2][t]*o)*a)));t.beginPath(),e.points.forEach((e,n)=>n?t.lineTo(e.x,e.y):t.moveTo(e.x,e.y)),t.closePath(),t.fillStyle=`rgb(${s.join(`,`)})`,t.fill(),t.strokeStyle=`rgba(${s.join(`,`)},.8)`,t.lineWidth=.7,t.stroke()}},destroy(){}}}function m(e){let t=e.cloneNode(!1);return t.dataset.shaderFallback=`true`,t.removeAttribute(`data-shader-renderer`),e.replaceWith(t),t}function h(e){let t=e,s;try{s=t.dataset.shaderFallback===`true`?null:f(t)}catch{t=m(t)}s||=p(t);let c=t.closest(`[data-shader-stage]`)||t.parentElement||t,l=window.matchMedia(`(prefers-reduced-motion: reduce)`),u={time:0,theme:n.includes(c.dataset.shaderTheme)?c.dataset.shaderTheme:`lime`,pointer:[0,0]},d=[0,0],h=c.dataset.shaderPaused===`true`,_=!0,v=!1,y=0,b=0,x=s&&t.dataset.shaderRenderer===`canvas2d`?1e3/24:o,S=0,C=!0,w=!1;function T(){c.dataset.shaderTheme=u.theme,c.dataset.shaderPaused=String(h);for(let e of c.querySelectorAll(`[data-shader-theme]`))e!==c&&e.setAttribute(`aria-pressed`,String(e.dataset.shaderTheme===u.theme));for(let e of c.querySelectorAll(`[data-shader-pause]`)){let t=h?`Reanudar animación`:`Pausar animación`;e.setAttribute(`aria-pressed`,String(h)),e.setAttribute(`aria-label`,t);let n=e.querySelector(`[data-shader-pause-label]`);n?n.textContent=t:e.textContent=t}}function E(){return!v&&!h&&!l.matches&&_&&!document.hidden&&w}function D(){!y&&!v&&_&&!document.hidden&&w&&(y=requestAnimationFrame(O))}function O(e){if(y=0,v||!_||document.hidden||!w)return;let t=E();if(!C&&t&&b&&e-b<x){D();return}t&&b&&(u.time+=Math.min((e-b)/1e3,.08)),l.matches||(u.pointer[0]+=(d[0]-u.pointer[0])*.07,u.pointer[1]+=(d[1]-u.pointer[1])*.07);let n=performance.now();s.draw(u);let r=performance.now()-n;r>12&&++S>=6?(x=Math.max(x,50),S=0):r<=12&&(S=Math.max(0,S-1)),b=e,C=!1,t&&D()}function k(){y&&cancelAnimationFrame(y),y=0,b=0,C=!0,D()}function A(){let e=t.getBoundingClientRect();if(w=e.width>0&&e.height>0,!w){k();return}let n=Math.min(window.devicePixelRatio||1,1.5,Math.sqrt(i/(e.width*e.height)),a/e.width,a/e.height),r=Math.max(1,Math.round(e.width*n)),o=Math.max(1,Math.round(e.height*n));(t.width!==r||t.height!==o)&&(t.width=r,t.height=o),k()}function j(e){let t=(e.target instanceof Element?e.target:null)?.closest(`[data-shader-theme], [data-shader-pause]`);t&&c.contains(t)&&t!==c&&!t.disabled&&(t.hasAttribute(`data-shader-pause`)?h=!h:n.includes(t.dataset.shaderTheme)&&(u.theme=t.dataset.shaderTheme),T(),k())}function M(e){if(l.matches||h||e.pointerType===`touch`)return;let n=t.getBoundingClientRect();n.width&&n.height&&(d[0]=Math.max(-1,Math.min(1,(e.clientX-n.left)/n.width*2-1)),d[1]=Math.max(-1,Math.min(1,(e.clientY-n.top)/n.height*2-1)))}function N(){d[0]=d[1]=0}function P(){l.matches&&(u.pointer[0]=u.pointer[1]=0),N(),k()}function F(e){e.preventDefault(),R(),r.delete(t);let n=m(t);n.isConnected&&g(n)}let I=typeof ResizeObserver==`function`?new ResizeObserver(A):null,L=typeof IntersectionObserver==`function`?new IntersectionObserver(e=>{_=e[0]?.isIntersecting??!0,k()},{rootMargin:`0px`,threshold:0}):null;I?.observe(t),L?.observe(t),I||window.addEventListener(`resize`,A,{passive:!0}),c.addEventListener(`click`,j),c.addEventListener(`pointermove`,M,{passive:!0}),c.addEventListener(`pointerleave`,N,{passive:!0}),t.addEventListener(`webglcontextlost`,F),l.addEventListener?l.addEventListener(`change`,P):l.addListener(P),T(),A();function R(){v||(v=!0,cancelAnimationFrame(y),I?.disconnect(),L?.disconnect(),window.removeEventListener(`resize`,A),c.removeEventListener(`click`,j),c.removeEventListener(`pointermove`,M),c.removeEventListener(`pointerleave`,N),t.removeEventListener(`webglcontextlost`,F),l.removeEventListener?l.removeEventListener(`change`,P):l.removeListener(P),s.destroy())}return{canvas:t,stage:c,refresh:k,destroy:R}}function g(e=document){let n=e.matches?.(t)?[e]:[...e.querySelectorAll(t)];for(let e of n){if(r.has(e)||!e.isConnected)continue;let t=h(e);r.set(t.canvas,t)}}function _(){for(let e of r.values())e.refresh()}function v(){c||(c=!0,g(document),s=new MutationObserver(e=>{for(let[e,t]of r)if(!e.isConnected||e.closest(`[data-shader-stage]`)!==t.stage){if(e.isConnected&&!e.closest(`[data-shader-stage]`)&&e.parentElement===t.stage)continue;t.destroy(),r.delete(e),e.isConnected&&g(e)}for(let n of e)for(let e of n.addedNodes)e.nodeType===1&&(e.matches(t)||e.querySelector(t))&&g(e)}),s.observe(document.documentElement,{childList:!0,subtree:!0}),document.addEventListener(`visibilitychange`,_),window.addEventListener(`pagehide`,y),window.addEventListener(`pageshow`,b))}function y(){for(let e of r.values())e.destroy();r.clear(),s?.disconnect()}function b(e){e.persisted&&(g(document),s?.observe(document.documentElement,{childList:!0,subtree:!0}))}function x(){y(),document.removeEventListener(`DOMContentLoaded`,v),document.removeEventListener(`visibilitychange`,_),window.removeEventListener(`pagehide`,y),window.removeEventListener(`pageshow`,b),s=void 0,c=!1}return typeof window<`u`&&typeof document<`u`&&(document.readyState===`loading`?document.addEventListener(`DOMContentLoaded`,v,{once:!0}):v()),e.disposeShaderScenes=x,e.mountShaderScenes=g,e})({});
