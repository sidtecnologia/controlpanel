document.addEventListener('DOMContentLoaded', function() {
    const userCards = document.querySelectorAll('.user-card');

    userCards.forEach((card, index) => {
        card.style.animationDelay = `${index * 0.1}s`;
        card.style.animationFillMode = 'forwards';
    });
});