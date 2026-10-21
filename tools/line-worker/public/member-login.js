const lineButton=document.querySelector('#memberLineLogin'),requestForm=document.querySelector('#emailRequestForm'),verifyForm=document.querySelector('#emailVerifyForm'),status=document.querySelector('#emailAuthStatus');
let emailEnabled=false;
fetch('/api/config',{cache:'no-store'}).then(response=>response.json()).then(config=>{
  if(config.line_login_configured){lineButton.href='/api/member/line/start';lineButton.removeAttribute('aria-disabled');lineButton.classList.remove('disabled');lineButton.textContent='LINEで無料会員登録';}else lineButton.textContent='LINE登録は準備中';
  emailEnabled=Boolean(config.email_login_configured);document.querySelector('#emailRequestButton').disabled=!emailEnabled;
  if(!emailEnabled)status.textContent='メール送信設定の完了後に利用できます。';
}).catch(()=>{status.textContent='登録状態を確認できませんでした。';});
requestForm.addEventListener('submit',async event=>{event.preventDefault();if(!emailEnabled)return;status.textContent='認証コードを送信しています…';const response=await fetch('/api/member/email/request',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:document.querySelector('#memberEmail').value})});if(!response.ok){status.textContent=response.status===429?'1分後にもう一度お試しください。':'コードを送信できませんでした。';return;}verifyForm.classList.remove('hidden');status.textContent='メールに届いた6桁コードを10分以内に入力してください。';});
verifyForm.addEventListener('submit',async event=>{event.preventDefault();status.textContent='確認しています…';const response=await fetch('/api/member/email/verify',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:document.querySelector('#memberEmail').value,code:document.querySelector('#memberEmailCode').value})});if(!response.ok){status.textContent='コードが違うか、有効期限が切れています。';return;}location.replace('/?member=logged-in');});
