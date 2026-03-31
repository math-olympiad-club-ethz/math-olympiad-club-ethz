document.addEventListener('DOMContentLoaded', function() {
    // Initialize tooltips
    var tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'))
    var tooltipList = tooltipTriggerList.map(function (tooltipTriggerEl) {
        return new bootstrap.Tooltip(tooltipTriggerEl)
    });

    // Problem search functionality
    const problemSearch = document.getElementById('problemSearch');
    if (problemSearch) {
        problemSearch.addEventListener('input', function(e) {
            const searchTerm = e.target.value.toLowerCase();
            const problemCards = document.querySelectorAll('.card');
            
            problemCards.forEach(card => {
                const title = card.querySelector('.card-title').textContent.toLowerCase();
                const category = card.querySelector('.card-text').textContent.toLowerCase();
                
                if (title.includes(searchTerm) || category.includes(searchTerm)) {
                    card.style.display = '';
                } else {
                    card.style.display = 'none';
                }
            });
        });
    }

    // Category filter functionality
    const categoryFilter = document.getElementById('categoryFilter');
    if (categoryFilter) {
        categoryFilter.addEventListener('change', function(e) {
            const selectedCategory = e.target.value;
            const problemCards = document.querySelectorAll('.card');
            
            problemCards.forEach(card => {
                const category = card.querySelector('.card-text').textContent;
                if (selectedCategory === 'All Categories' || category.includes(selectedCategory)) {
                    card.style.display = '';
                } else {
                    card.style.display = 'none';
                }
            });
        });
    }

    // Auto-render KaTeX elements
    document.querySelectorAll('.math').forEach(element => {
        katex.render(element.textContent, element, {
            throwOnError: false,
            displayMode: element.classList.contains('display-math')
        });
    });
});
