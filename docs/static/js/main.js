document.addEventListener('DOMContentLoaded', function() {
    // Initialize tooltips
    var tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'))
    var tooltipList = tooltipTriggerList.map(function (tooltipTriggerEl) {
        return new bootstrap.Tooltip(tooltipTriggerEl)
    });

    // Auto-render KaTeX elements
    document.querySelectorAll('.math').forEach(element => {
        katex.render(element.textContent, element, {
            throwOnError: false,
            displayMode: element.classList.contains('display-math')
        });
    });
});
