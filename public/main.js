const form = document.getElementById('registerForm');
const submitBtn = document.getElementById('submitBtn');
const btnText = document.getElementById('btnText');
const btnSpinner = document.getElementById('btnSpinner');
const feedback = document.getElementById('feedback');

form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const data = {
    name: form.name.value.trim(),
    email: form.email.value.trim(),
    phone: form.phone.value.trim(),
    message: form.message.value.trim(),
  };

  // Loading state
  submitBtn.disabled = true;
  btnText.textContent = 'Envoi en cours…';
  btnSpinner.classList.remove('hidden');
  feedback.className = 'feedback hidden';
  feedback.textContent = '';

  try {
    const res = await fetch('/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });

    const json = await res.json();

    if (res.ok) {
      showFeedback('success', '🎉 Vous êtes sur la liste ! Nous vous contacterons bientôt.');
      form.reset();
      submitBtn.disabled = true;
      btnText.textContent = 'Inscription confirmée !';
    } else {
      showFeedback('error', json.error || 'Une erreur est survenue. Veuillez réessayer.');
      resetButton();
    }
  } catch {
    showFeedback('error', 'Erreur réseau. Vérifiez votre connexion et réessayez.');
    resetButton();
  } finally {
    btnSpinner.classList.add('hidden');
  }
});

function showFeedback(type, message) {
  feedback.textContent = message;
  feedback.className = `feedback ${type}`;
}

function resetButton() {
  submitBtn.disabled = false;
  btnText.textContent = 'Me prévenir au lancement';
}
