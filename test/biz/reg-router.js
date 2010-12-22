function (subs) {  
  if(subs.length > 0)
    return { subs: subs, ok: true};
  return { ok: false };
}
