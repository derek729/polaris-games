// Form Handling Module
const formHandler = (function() {
    const API_URL = '/api/signup'; // Replace with actual API endpoint

    // Initialize form handling
    function init() {
        const form = document.getElementById('signupForm');
        if (form) {
            form.addEventListener('submit', handleSignup);
        }
    }

    // Handle form submission
    async function handleSignup(event) {
        event.preventDefault();

        const form = event.target;
        const submitBtn = form.querySelector('button[type="submit"]');

        // Get form data
        const formData = {
            email: form.email.value.trim(),
            role: form.role.value,
            country: form.country.value,
            privacy: form.privacy.checked,
            language: i18n.getCurrentLang(),
            timestamp: new Date().toISOString()
        };

        // Validate form
        if (!validateForm(formData)) {
            return;
        }

        // Disable submit button and show loading state
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span class="spinner"></span> Processing...';

        try {
            // Simulate API call (replace with actual API call)
            await submitForm(formData);

            // Show success message
            showSuccess();

            // Reset form
            form.reset();

        } catch (error) {
            console.error('Signup error:', error);
            showError(error.message);
        } finally {
            // Re-enable submit button
            submitBtn.disabled = false;
            submitBtn.innerHTML = `<span data-i18n="signup.submit">${i18n.t('signup.submit')}</span>`;
        }
    }

    // Validate form data
    function validateForm(data) {
        // Email validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(data.email)) {
            showError('Please enter a valid email address');
            return false;
        }

        // Role validation
        if (!data.role) {
            showError('Please select your role');
            return false;
        }

        // Country validation
        if (!data.country) {
            showError('Please select your country');
            return false;
        }

        // Privacy policy validation
        if (!data.privacy) {
            showError('Please agree to the Privacy Policy');
            return false;
        }

        return true;
    }

    // Submit form to server
    async function submitForm(data) {
        // In a real implementation, this would make an API call
        // For now, we'll simulate it

        return new Promise((resolve, reject) => {
            setTimeout(() => {
                // Simulate success (90% success rate for demo)
                if (Math.random() < 0.9) {
                    resolve({ success: true });
                } else {
                    reject(new Error('Something went wrong. Please try again.'));
                }
            }, 1500);

            /* Real API call example:
            fetch(API_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(data)
            })
            .then(response => {
                if (!response.ok) {
                    throw new Error('Network response was not ok');
                }
                return response.json();
            })
            .then(data => resolve(data))
            .catch(error => reject(error));
            */
        });
    }

    // Show success message
    function showSuccess() {
        const form = document.getElementById('signupForm');
        const success = document.getElementById('signupSuccess');

        if (form && success) {
            form.style.display = 'none';
            success.style.display = 'block';

            // Add celebration effect
            confettiEffect();

            // Track signup event (if analytics is enabled)
            trackSignup();
        }
    }

    // Show error message
    function showError(message) {
        // Create error toast
        const toast = document.createElement('div');
        toast.className = 'toast toast-error';
        toast.textContent = message;
        document.body.appendChild(toast);

        // Animate in
        setTimeout(() => {
            toast.classList.add('show');
        }, 100);

        // Auto remove after 3 seconds
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => {
                document.body.removeChild(toast);
            }, 300);
        }, 3000);
    }

    // Confetti celebration effect
    function confettiEffect() {
        const colors = ['#FF6B6B', '#4ECDC4', '#95E1D3', '#FCE38A'];

        for (let i = 0; i < 50; i++) {
            setTimeout(() => {
                const confetti = document.createElement('div');
                confetti.className = 'confetti';
                confetti.style.cssText = `
                    position: fixed;
                    width: 10px;
                    height: 10px;
                    background: ${colors[Math.floor(Math.random() * colors.length)]};
                    left: ${Math.random() * 100}vw;
                    top: -10px;
                    opacity: ${Math.random()};
                    animation: fall ${2 + Math.random() * 2}s linear forwards;
                    z-index: 10000;
                `;
                document.body.appendChild(confetti);

                // Remove after animation
                setTimeout(() => {
                    document.body.removeChild(confetti);
                }, 4000);
            }, i * 30);
        }

        // Add CSS animation if not already present
        if (!document.querySelector('#confetti-style')) {
            const style = document.createElement('style');
            style.id = 'confetti-style';
            style.textContent = `
                @keyframes fall {
                    to {
                        transform: translateY(100vh) rotate(720deg);
                        opacity: 0;
                    }
                }
            `;
            document.head.appendChild(style);
        }
    }

    // Track signup event (for analytics)
    function trackSignup() {
        // Example: Google Analytics
        if (typeof gtag !== 'undefined') {
            gtag('event', 'signup', {
                'event_category': 'engagement',
                'event_label': 'email_signup'
            });
        }

        // Example: Facebook Pixel
        if (typeof fbq !== 'undefined') {
            fbq('track', 'Lead');
        }
    }

    // Public API
    return {
        init
    };
})();

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', formHandler.init);
} else {
    formHandler.init();
}
