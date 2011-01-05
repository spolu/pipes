function (msg) {
  return (msg.type() !== '1w-c' && 
	  msg.type() !== '2w-c');
}
