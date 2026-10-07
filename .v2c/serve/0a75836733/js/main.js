// ========================================
// Anbu Landing Page - Main JavaScript
// ========================================

document.addEventListener('DOMContentLoaded', async function() {
    // Initialize i18n
    await window.i18n.init();

    // Initialize all components
    initNavbar();
    initFAQ();
    initPricingToggle();
    initSignupForm();
    initSmoothScroll();
    initAnimations();
});

// Navbar functionality
function initNavbar() {
    const navbar = document.querySelector('.navbar');
    const mobileMenuBtn = document.querySelector('.mobile-menu-btn');
    const navLinks = document.querySelector('.nav-links');

    // Scroll effect
    window.addEventListener('scroll', () => {
        if (window.scrollY > 50) {
            navbar.classList.add('scrolled');
        } else {
            navbar.classList.remove('scrolled');
        }
    });

    // Mobile menu toggle
    if (mobileMenuBtn) {
        mobileMenuBtn.addEventListener('click', () => {
            navLinks.classList.toggle('active');
            mobileMenuBtn.classList.toggle('active');
        });
    }
}

// FAQ accordion
function initFAQ() {
    const faqItems = document.querySelectorAll('.faq-item');

    faqItems.forEach(item => {
        const question = item.querySelector('.faq-question');

        question.addEventListener('click', () => {
            // Close other items
            faqItems.forEach(otherItem => {
                if (otherItem !== item) {
                    otherItem.classList.remove('active');
                }
            });

            // Toggle current item
            item.classList.toggle('active');
        });
    });
}

// Pricing toggle (monthly/yearly)
function initPricingToggle() {
    const toggle = document.getElementById('pricing-toggle');
    const monthlyPrices = document.querySelectorAll('.monthly-price');
    const yearlyPrices = document.querySelectorAll('.yearly-price');

    if (!toggle) return;

    toggle.addEventListener('change', () => {
        if (toggle.checked) {
            // Yearly
            monthlyPrices.forEach(el => el.style.display = 'none');
            yearlyPrices.forEach(el => el.style.display = 'inline');
        } else {
            // Monthly
            monthlyPrices.forEach(el => el.style.display = 'inline');
            yearlyPrices.forEach(el => el.style.display = 'none');
        }
    });
}

// Signup form
function initSignupForm() {
    const form = document.getElementById('signup-form');
    const successMessage = document.getElementById('signup-success');

    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const formData = new FormData(form);
        const data = {
            email: formData.get('email'),
            country: formData.get('country'),
            role: formData.get('role'),
            language: window.i18n.current,
            timestamp: new Date().toISOString()
        };

        try {
            // Send to your backend or Firebase
            // For now, we'll simulate a successful submission
            console.log('Signup data:', data);

            // In production, you would send this to your server:
            // await fetch('/api/signup', {
            //     method: 'POST',
            //     headers: { 'Content-Type': 'application/json' },
            //     body: JSON.stringify(data)
            // });

            // Store in localStorage for demo
            const signups = JSON.parse(localStorage.getItem('anbu_signups') || '[]');
            signups.push(data);
            localStorage.setItem('anbu_signups', JSON.stringify(signups));

            // Show success message
            form.style.display = 'none';
            successMessage.style.display = 'block';

            // Track conversion (Google Analytics, etc.)
            if (typeof gtag !== 'undefined') {
                gtag('event', 'signup', {
                    'event_category': 'engagement',
                    'event_label': data.country
                });
            }

        } catch (error) {
            console.error('Signup error:', error);
            alert('An error occurred. Please try again.');
        }
    });
}

// Smooth scroll for anchor links
function initSmoothScroll() {
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function(e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                const navHeight = document.querySelector('.navbar').offsetHeight;
                const targetPosition = target.offsetTop - navHeight;

                window.scrollTo({
                    top: targetPosition,
                    behavior: 'smooth'
                });
            }
        });
    });
}

// Scroll animations
function initAnimations() {
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('animate-in');
                observer.unobserve(entry.target);
            }
        });
    }, observerOptions);

    // Observe elements
    document.querySelectorAll('.feature-card, .problem-card, .testimonial-card, .pricing-card, .comparison-card').forEach(el => {
        el.classList.add('animate-ready');
        observer.observe(el);
    });
}

// Add animation styles dynamically
const animationStyles = document.createElement('style');
animationStyles.textContent = `
    .animate-ready {
        opacity: 0;
        transform: translateY(30px);
        transition: opacity 0.6s ease, transform 0.6s ease;
    }

    .animate-in {
        opacity: 1;
        transform: translateY(0);
    }
`;
document.head.appendChild(animationStyles);

// Phone mockup interaction (optional enhancement)
document.querySelectorAll('.anbu-btn').forEach(btn => {
    btn.addEventListener('click', function() {
        this.classList.add('clicked');
        setTimeout(() => this.classList.remove('clicked'), 200);
    });
});

// Add click animation style
const clickStyle = document.createElement('style');
clickStyle.textContent = `
    .anbu-btn.clicked {
        transform: scale(0.95);
    }
`;
document.head.appendChild(clickStyle);
