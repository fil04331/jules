from playwright.sync_api import sync_playwright, expect

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto("http://localhost:3000")

        # Click the "Go to Admin" button
        admin_link = page.get_by_role("link", name="Go to Admin")
        admin_link.click()

        # Take a screenshot for debugging
        page.screenshot(path="jules-scratch/verification/admin_dashboard_debug.png")

        # Wait for the "Loading..." message to be visible
        expect(page.get_by_text("Loading...")).to_be_visible()

        # Take a screenshot
        page.screenshot(path="jules-scratch/verification/admin_dashboard.png")

        browser.close()

if __name__ == "__main__":
    run()
