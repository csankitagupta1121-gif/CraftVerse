// CraftVerse - Global Shared JavaScript (Cart & Auth Helper)

// Get Cart from LocalStorage
function getCart() {
    return JSON.parse(localStorage.getItem("craftverse_cart")) || [];
}

// Save Cart to LocalStorage
function saveCart(cart) {
    localStorage.setItem("craftverse_cart", JSON.stringify(cart));
    updateCartCount();
}

// Update Cart Count in Navbar
function updateCartCount() {
    const countElements = document.querySelectorAll(".cart-count-badge");
    const cart = getCart();
    const totalItems = cart.reduce((sum, item) => sum + (item.quantity || 1), 0);
    
    countElements.forEach(el => {
        el.textContent = totalItems;
        el.style.display = totalItems > 0 ? "inline-block" : "none";
    });
}

// Add Item to Cart
function addToCart(product) {
    let cart = getCart();
    const existingIndex = cart.findIndex(item => item.id === product.id);

    if (existingIndex > -1) {
        cart[existingIndex].quantity = (cart[existingIndex].quantity || 1) + 1;
    } else {
        cart.push({
            id: product.id,
            name: product.name,
            price: Number(product.price),
            image: product.image,
            quantity: 1
        });
    }

    saveCart(cart);
    showToast(`"${product.name}" added to cart! 🛒`);
}

// Show Toast Notification
function showToast(message) {
    let toast = document.getElementById("toast-notification");
    if (!toast) {
        toast = document.createElement("div");
        toast.id = "toast-notification";
        toast.className = "toast-notification";
        document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add("show");

    setTimeout(() => {
        toast.classList.remove("show");
    }, 3000);
}

// Check and Update Auth State in Navbar
function updateNavbarAuth() {
    const user = JSON.parse(localStorage.getItem("craftverse_user"));
    const navAuthContainer = document.getElementById("nav-auth-links");
    
    if (!navAuthContainer) return;

    if (user && user.name) {
        navAuthContainer.innerHTML = `
            <a href="profile.html" class="nav-user">👤 ${user.name.split(" ")[0]}</a>
            <a href="orders.html">Orders</a>
            <a href="#" onclick="logoutUser(event)" class="nav-logout">Logout</a>
        `;
    } else {
        navAuthContainer.innerHTML = `
            <a href="login.html">Login</a>
        `;
    }
}

// Logout User
function logoutUser(e) {
    if (e) e.preventDefault();
    localStorage.removeItem("craftverse_user");
    localStorage.removeItem("craftverse_token");
    showToast("Logged out successfully! 👋");
    setTimeout(() => {
        window.location.href = "index.html";
    }, 800);
}

// Initialize on page load
document.addEventListener("DOMContentLoaded", () => {
    updateCartCount();
    updateNavbarAuth();
});
