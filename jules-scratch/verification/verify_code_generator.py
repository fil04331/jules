import re
from playwright.sync_api import sync_playwright, expect

def run_verification():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        try:
            # 1. Define the mock response
            mock_response = {
                "code_id": "mock-code-id-12345",
                "filename": "hello_world.py"
            }

            # 2. Intercept the network request and provide the mock response
            page.route(
                re.compile("/api/generate-code"),
                lambda route: route.fulfill(
                    status=200,
                    json=mock_response
                )
            )

            # 3. Navigate to the code generator page on the correct port
            page.goto("http://localhost:3001/code-generator")

            # 4. Fill out the form
            prompt_textarea = page.get_by_label("Prompt")
            expect(prompt_textarea).to_be_visible()
            prompt_textarea.fill("Create a simple 'hello world' function in Python")

            filename_input = page.get_by_label("Filename")
            expect(filename_input).to_be_visible()
            filename_input.fill("hello_world.py")

            # 5. Submit the form
            generate_button = page.get_by_role("button", name="Generate Code")
            generate_button.click()

            # 6. Wait for the result and assert the download link is visible
            download_link = page.get_by_role("link", name="Download hello_world.py")
            expect(download_link).to_be_visible()

            # 7. Take a screenshot
            page.screenshot(path="jules-scratch/verification/verification.png")

            print("Verification script with mocked API completed successfully.")

        except Exception as e:
            print(f"An error occurred during verification: {e}")
            page.screenshot(path="jules-scratch/verification/error.png")

        finally:
            browser.close()

if __name__ == "__main__":
    run_verification()