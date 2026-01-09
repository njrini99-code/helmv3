# Page snapshot

```yaml
- generic [ref=e4]:
  - generic [ref=e5]:
    - generic [ref=e6]:
      - img "BaseballHelm" [ref=e8]
      - heading "BaseballHelm" [level=1] [ref=e9]
    - generic [ref=e10]:
      - heading "Welcome back" [level=2] [ref=e11]
      - paragraph [ref=e12]: Sign in to continue to your dashboard
    - generic [ref=e13]:
      - generic [ref=e14]:
        - text: Email
        - textbox "you@example.com" [ref=e15]
      - generic [ref=e16]:
        - generic [ref=e17]:
          - text: Password
          - link "Forgot password?" [ref=e18] [cursor=pointer]:
            - /url: /baseball/forgot-password
        - textbox "••••••••" [ref=e19]
      - button "Sign in" [ref=e20]
      - generic [ref=e21]: or
      - button "Continue with Google" [disabled] [ref=e22]:
        - img [ref=e23]
        - text: Continue with Google
  - paragraph [ref=e28]:
    - text: Don't have an account?
    - link "Sign up" [ref=e29] [cursor=pointer]:
      - /url: /baseball/signup
  - paragraph [ref=e30]:
    - link "← Back to HelmLabs" [ref=e31] [cursor=pointer]:
      - /url: /
  - paragraph [ref=e32]:
    - link "Privacy" [ref=e33] [cursor=pointer]:
      - /url: /privacy
    - text: ·
    - link "Terms" [ref=e34] [cursor=pointer]:
      - /url: /terms
```