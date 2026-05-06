import pytest
from playwright.async_api import async_playwright, expect

@pytest.mark.asyncio
async def test_login_and_logout_flow():
    """Verify that an admin can log in, view the dashboard, and log out."""
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        try:
            await page.goto("http://localhost:5173/login", timeout=5000)
        except Exception:
            await browser.close()
            pytest.skip("Frontend dev server is not running on localhost:5173")
            
        await page.fill("input[name='username']", "admin")
        await page.fill("input[name='password']", "admin123")
        await page.click("button[type='submit']")
        
        # Wait for navigation to dashboard
        await expect(page).to_have_url("http://localhost:5173/history-analysis", timeout=5000)
        
        # Check if operations center is visible for admin
        operations_menu = page.locator("text=Operations")
        await expect(operations_menu).to_be_visible()
        
        # Logout
        await page.click("button:has-text('Logout')")
        await expect(page).to_have_url("http://localhost:5173/login", timeout=5000)
        await browser.close()

@pytest.mark.asyncio
async def test_sidebar_routing():
    """Verify navigation between main dashboard pages via the sidebar."""
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        try:
            await page.goto("http://localhost:5173/login", timeout=5000)
        except Exception:
            await browser.close()
            pytest.skip("Frontend dev server is not running on localhost:5173")
            
        await page.fill("input[name='username']", "admin")
        await page.fill("input[name='password']", "admin123")
        await page.click("button[type='submit']")
        await expect(page).to_have_url("http://localhost:5173/history-analysis", timeout=5000)
        
        # Navigate to Terminal Map
        await page.click("text=Terminal Heatmap")
        await expect(page).to_have_url("http://localhost:5173/heatmap", timeout=5000)
        
        # Navigate to Requests
        await page.click("text=Requests")
        await expect(page).to_have_url("http://localhost:5173/requests", timeout=5000)
        
        # Open Operations Center
        await page.click("text=Operations")
        
        # Navigate to User Management
        await page.click("text=User Management")
        await expect(page).to_have_url("http://localhost:5173/user-management", timeout=5000)
        
        # Verify the User Management header exists
        await expect(page.locator("h5", has_text="User Management")).to_be_visible()
        await browser.close()
