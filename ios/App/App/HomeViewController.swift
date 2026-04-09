import UIKit

class HomeViewController: UIViewController {

    // MARK: - Callback

    var onGolfHelmSignIn: (() -> Void)?

    // MARK: - Design System

    private enum Design {
        static let cream = UIColor(red: 1.0, green: 254.0/255.0, blue: 250.0/255.0, alpha: 1.0)
        static let primaryGreen = UIColor(red: 22.0/255.0, green: 163.0/255.0, blue: 74.0/255.0, alpha: 1.0)
        static let darkGreen = UIColor(red: 16.0/255.0, green: 120.0/255.0, blue: 54.0/255.0, alpha: 1.0)
        static let lightGreen = UIColor(red: 74.0/255.0, green: 222.0/255.0, blue: 128.0/255.0, alpha: 1.0)
        static let emerald = UIColor(red: 16.0/255.0, green: 185.0/255.0, blue: 129.0/255.0, alpha: 1.0)
        static let textPrimary = UIColor(red: 28.0/255.0, green: 25.0/255.0, blue: 23.0/255.0, alpha: 1.0)
        static let textSecondary = UIColor(red: 120.0/255.0, green: 113.0/255.0, blue: 108.0/255.0, alpha: 1.0)
        static let cardRadius: CGFloat = 24
    }

    // MARK: - UI Elements

    private let scrollView = UIScrollView()
    private let contentStack = UIStackView()
    private var orbViews: [UIView] = []

    private let logoImageView = UIImageView()
    private let titleLabel = UILabel()
    private let subtitleLabel = UILabel()

    private var golfCard: UIView!
    private var baseballCard: UIView!

    private let footerLabel = UILabel()

    private var animatableElements: [UIView] = []

    // MARK: - Lifecycle

    override func viewDidLoad() {
        super.viewDidLoad()
        overrideUserInterfaceStyle = .light
        view.backgroundColor = Design.cream
        setupOrbs()
        setupLayout()
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        animateEntrance()
        startOrbAnimations()
    }

    override var preferredStatusBarStyle: UIStatusBarStyle { .darkContent }

    // MARK: - Floating Orbs

    private func setupOrbs() {
        let orbConfigs: [(size: CGFloat, color: UIColor, alpha: CGFloat, x: CGFloat, y: CGFloat, blur: CGFloat)] = [
            // Large green orb — top right
            (size: 280, color: Design.primaryGreen, alpha: 0.12, x: 0.75, y: 0.08, blur: 80),
            // Medium emerald orb — bottom left
            (size: 220, color: Design.emerald, alpha: 0.10, x: 0.1, y: 0.65, blur: 70),
            // Small light green orb — mid left
            (size: 140, color: Design.lightGreen, alpha: 0.14, x: 0.15, y: 0.35, blur: 50),
            // Tiny accent orb — top left
            (size: 100, color: Design.primaryGreen, alpha: 0.08, x: 0.05, y: 0.12, blur: 40),
            // Medium warm orb — bottom right
            (size: 180, color: UIColor(red: 245.0/255.0, green: 158.0/255.0, blue: 11.0/255.0, alpha: 1.0),
             alpha: 0.06, x: 0.85, y: 0.8, blur: 60),
        ]

        for config in orbConfigs {
            let orb = makeOrb(
                size: config.size,
                color: config.color,
                alpha: config.alpha,
                blur: config.blur
            )
            let screenW = UIScreen.main.bounds.width
            let screenH = UIScreen.main.bounds.height
            orb.center = CGPoint(
                x: screenW * config.x,
                y: screenH * config.y
            )
            view.addSubview(orb)
            orbViews.append(orb)
        }
    }

    private func makeOrb(size: CGFloat, color: UIColor, alpha: CGFloat, blur: CGFloat) -> UIView {
        let container = UIView(frame: CGRect(x: 0, y: 0, width: size, height: size))
        container.backgroundColor = .clear

        // Gradient circle
        let gradient = CAGradientLayer()
        gradient.type = .radial
        gradient.colors = [
            color.withAlphaComponent(alpha).cgColor,
            color.withAlphaComponent(alpha * 0.5).cgColor,
            color.withAlphaComponent(0).cgColor
        ]
        gradient.locations = [0, 0.5, 1]
        gradient.startPoint = CGPoint(x: 0.5, y: 0.5)
        gradient.endPoint = CGPoint(x: 1, y: 1)
        gradient.frame = container.bounds
        gradient.cornerRadius = size / 2
        container.layer.addSublayer(gradient)

        // Apply blur for soft glow
        let blurEffect = UIBlurEffect(style: .light)
        let blurView = UIVisualEffectView(effect: blurEffect)
        blurView.frame = container.bounds
        blurView.layer.cornerRadius = size / 2
        blurView.clipsToBounds = true
        blurView.alpha = 0.3
        container.addSubview(blurView)

        return container
    }

    private func startOrbAnimations() {
        for (index, orb) in orbViews.enumerated() {
            let duration = 6.0 + Double(index) * 1.5
            let xDrift = CGFloat.random(in: -20...20)
            let yDrift = CGFloat.random(in: -15...15)

            animateOrbFloat(orb, duration: duration, xRange: xDrift, yRange: yDrift)
        }
    }

    private func animateOrbFloat(_ orb: UIView, duration: TimeInterval, xRange: CGFloat, yRange: CGFloat) {
        let originalCenter = orb.center
        UIView.animate(
            withDuration: duration,
            delay: 0,
            options: [.curveEaseInOut, .autoreverse, .repeat, .allowUserInteraction],
            animations: {
                orb.center = CGPoint(
                    x: originalCenter.x + xRange,
                    y: originalCenter.y + yRange
                )
                orb.transform = CGAffineTransform(scaleX: 1.08, y: 1.08)
            }
        )
    }

    // MARK: - Layout

    private func setupLayout() {
        scrollView.translatesAutoresizingMaskIntoConstraints = false
        scrollView.showsVerticalScrollIndicator = false
        scrollView.alwaysBounceVertical = true
        view.addSubview(scrollView)

        NSLayoutConstraint.activate([
            scrollView.topAnchor.constraint(equalTo: view.topAnchor),
            scrollView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            scrollView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            scrollView.bottomAnchor.constraint(equalTo: view.bottomAnchor)
        ])

        contentStack.axis = .vertical
        contentStack.alignment = .center
        contentStack.spacing = 0
        contentStack.translatesAutoresizingMaskIntoConstraints = false
        scrollView.addSubview(contentStack)

        NSLayoutConstraint.activate([
            contentStack.topAnchor.constraint(equalTo: scrollView.contentLayoutGuide.topAnchor),
            contentStack.leadingAnchor.constraint(equalTo: scrollView.contentLayoutGuide.leadingAnchor),
            contentStack.trailingAnchor.constraint(equalTo: scrollView.contentLayoutGuide.trailingAnchor),
            contentStack.bottomAnchor.constraint(equalTo: scrollView.contentLayoutGuide.bottomAnchor),
            contentStack.widthAnchor.constraint(equalTo: scrollView.frameLayoutGuide.widthAnchor)
        ])

        setupHeader()
        setupCards()
        setupFooter()

        // Prepare for entrance animation
        for element in animatableElements {
            element.alpha = 0
            element.transform = CGAffineTransform(translationX: 0, y: 24)
        }
    }

    // MARK: - Header

    private func setupHeader() {
        let headerStack = UIStackView()
        headerStack.axis = .vertical
        headerStack.alignment = .center
        headerStack.spacing = 6
        headerStack.translatesAutoresizingMaskIntoConstraints = false

        // Logo with subtle shadow glow
        logoImageView.image = loadBundleImage(named: "Helm-Logo-New-Main")
        logoImageView.contentMode = .scaleAspectFit
        logoImageView.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            logoImageView.widthAnchor.constraint(equalToConstant: 68),
            logoImageView.heightAnchor.constraint(equalToConstant: 68)
        ])
        logoImageView.layer.cornerRadius = 18
        logoImageView.clipsToBounds = true
        logoImageView.layer.borderWidth = 1
        logoImageView.layer.borderColor = UIColor.white.withAlphaComponent(0.5).cgColor

        // Logo glow container
        let logoContainer = UIView()
        logoContainer.translatesAutoresizingMaskIntoConstraints = false
        logoContainer.addSubview(logoImageView)
        logoContainer.layer.shadowColor = Design.primaryGreen.cgColor
        logoContainer.layer.shadowOpacity = 0.2
        logoContainer.layer.shadowRadius = 20
        logoContainer.layer.shadowOffset = .zero
        NSLayoutConstraint.activate([
            logoImageView.topAnchor.constraint(equalTo: logoContainer.topAnchor),
            logoImageView.bottomAnchor.constraint(equalTo: logoContainer.bottomAnchor),
            logoImageView.leadingAnchor.constraint(equalTo: logoContainer.leadingAnchor),
            logoImageView.trailingAnchor.constraint(equalTo: logoContainer.trailingAnchor)
        ])

        // Title
        titleLabel.text = "Helm Sports Labs"
        titleLabel.accessibilityTraits = .header
        titleLabel.font = .preferredFont(forTextStyle: .title1)
        titleLabel.textColor = Design.textPrimary
        titleLabel.textAlignment = .center

        // Subtitle
        subtitleLabel.text = "College sports technology"
        subtitleLabel.font = .preferredFont(forTextStyle: .subheadline)
        subtitleLabel.textColor = Design.textSecondary
        subtitleLabel.textAlignment = .center

        headerStack.addArrangedSubview(logoContainer)
        headerStack.setCustomSpacing(16, after: logoContainer)
        headerStack.addArrangedSubview(titleLabel)
        headerStack.addArrangedSubview(subtitleLabel)

        let headerContainer = UIView()
        headerContainer.translatesAutoresizingMaskIntoConstraints = false
        headerContainer.addSubview(headerStack)

        NSLayoutConstraint.activate([
            headerStack.topAnchor.constraint(equalTo: headerContainer.topAnchor, constant: 64),
            headerStack.leadingAnchor.constraint(equalTo: headerContainer.leadingAnchor, constant: 24),
            headerStack.trailingAnchor.constraint(equalTo: headerContainer.trailingAnchor, constant: -24),
            headerStack.bottomAnchor.constraint(equalTo: headerContainer.bottomAnchor, constant: -28)
        ])

        contentStack.addArrangedSubview(headerContainer)
        NSLayoutConstraint.activate([
            headerContainer.widthAnchor.constraint(equalTo: contentStack.widthAnchor)
        ])

        animatableElements.append(contentsOf: [logoContainer, titleLabel, subtitleLabel])
    }

    // MARK: - Cards

    private func setupCards() {
        golfCard = buildGolfHelmCard()
        baseballCard = buildBaseballHelmCard()

        let cardsContainer = UIStackView(arrangedSubviews: [golfCard, baseballCard])
        cardsContainer.axis = .vertical
        cardsContainer.spacing = 16
        cardsContainer.translatesAutoresizingMaskIntoConstraints = false

        let cardsWrapper = UIView()
        cardsWrapper.translatesAutoresizingMaskIntoConstraints = false
        cardsWrapper.addSubview(cardsContainer)

        NSLayoutConstraint.activate([
            cardsContainer.topAnchor.constraint(equalTo: cardsWrapper.topAnchor),
            cardsContainer.leadingAnchor.constraint(equalTo: cardsWrapper.leadingAnchor, constant: 20),
            cardsContainer.trailingAnchor.constraint(equalTo: cardsWrapper.trailingAnchor, constant: -20),
            cardsContainer.bottomAnchor.constraint(equalTo: cardsWrapper.bottomAnchor)
        ])

        contentStack.addArrangedSubview(cardsWrapper)
        NSLayoutConstraint.activate([
            cardsWrapper.widthAnchor.constraint(equalTo: contentStack.widthAnchor)
        ])

        animatableElements.append(contentsOf: [golfCard, baseballCard])
    }

    private func buildGolfHelmCard() -> UIView {
        let card = makeGlassCard()

        let innerStack = UIStackView()
        innerStack.axis = .vertical
        innerStack.spacing = 4
        innerStack.translatesAutoresizingMaskIntoConstraints = false

        // Top row: logo + title
        let topRow = UIStackView()
        topRow.axis = .horizontal
        topRow.alignment = .center
        topRow.spacing = 14

        let logo = UIImageView()
        logo.image = loadBundleImage(named: "helm-golf-logo-transparent")
        logo.contentMode = .scaleAspectFit
        logo.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            logo.widthAnchor.constraint(equalToConstant: 48),
            logo.heightAnchor.constraint(equalToConstant: 48)
        ])

        let titleStack = UIStackView()
        titleStack.axis = .vertical
        titleStack.spacing = 2

        let title = UILabel()
        title.text = "GolfHelm"
        title.font = .preferredFont(forTextStyle: .title2)
        title.textColor = Design.textPrimary

        let tagline = UILabel()
        tagline.text = "Team Management & Analytics"
        tagline.font = .systemFont(ofSize: 13, weight: .semibold)
        tagline.textColor = Design.primaryGreen

        titleStack.addArrangedSubview(title)
        titleStack.addArrangedSubview(tagline)

        topRow.addArrangedSubview(logo)
        topRow.addArrangedSubview(titleStack)

        // Divider
        let divider = UIView()
        divider.translatesAutoresizingMaskIntoConstraints = false
        divider.backgroundColor = UIColor.black.withAlphaComponent(0.05)
        NSLayoutConstraint.activate([divider.heightAnchor.constraint(equalToConstant: 1)])

        // Description
        let desc = UILabel()
        desc.text = "Track every shot. Develop every player.\nAI-powered coaching intelligence for college golf programs."
        desc.font = .preferredFont(forTextStyle: .subheadline)
        desc.textColor = Design.textSecondary
        desc.numberOfLines = 0
        desc.lineBreakMode = .byWordWrapping

        // Features row
        let featuresRow = buildFeaturesRow([
            ("chart.bar.fill", "Stats"),
            ("brain.head.profile", "CoachHelm"),
            ("person.3.fill", "Roster"),
            ("calendar", "Events")
        ])

        // Sign In button
        let signInButton = UIButton(type: .system)
        signInButton.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            signInButton.heightAnchor.constraint(equalToConstant: 52)
        ])

        var config = UIButton.Configuration.filled()
        config.title = "Sign In"
        config.baseBackgroundColor = Design.primaryGreen
        config.baseForegroundColor = .white
        config.cornerStyle = .large
        config.image = UIImage(systemName: "arrow.right", withConfiguration: UIImage.SymbolConfiguration(weight: .semibold))
        config.imagePlacement = .trailing
        config.imagePadding = 8
        config.titleTextAttributesTransformer = UIConfigurationTextAttributesTransformer { incoming in
            var outgoing = incoming
            outgoing.font = UIFont.preferredFont(forTextStyle: .headline)
            return outgoing
        }
        signInButton.configuration = config
        signInButton.accessibilityLabel = "Sign in to GolfHelm"
        signInButton.accessibilityHint = "Opens the GolfHelm login page"
        signInButton.configurationUpdateHandler = { button in
            var updatedConfig = button.configuration
            updatedConfig?.baseBackgroundColor = button.isHighlighted
                ? Design.darkGreen
                : Design.primaryGreen
            button.configuration = updatedConfig
        }
        signInButton.layer.shadowColor = Design.primaryGreen.cgColor
        signInButton.layer.shadowOpacity = 0.3
        signInButton.layer.shadowRadius = 12
        signInButton.layer.shadowOffset = CGSize(width: 0, height: 4)
        signInButton.addTarget(self, action: #selector(golfSignInTapped), for: .touchUpInside)

        innerStack.addArrangedSubview(topRow)
        innerStack.setCustomSpacing(16, after: topRow)
        innerStack.addArrangedSubview(divider)
        innerStack.setCustomSpacing(16, after: divider)
        innerStack.addArrangedSubview(desc)
        innerStack.setCustomSpacing(20, after: desc)
        innerStack.addArrangedSubview(featuresRow)
        innerStack.setCustomSpacing(24, after: featuresRow)
        innerStack.addArrangedSubview(signInButton)

        card.addSubview(innerStack)
        NSLayoutConstraint.activate([
            innerStack.topAnchor.constraint(equalTo: card.topAnchor, constant: 24),
            innerStack.leadingAnchor.constraint(equalTo: card.leadingAnchor, constant: 24),
            innerStack.trailingAnchor.constraint(equalTo: card.trailingAnchor, constant: -24),
            innerStack.bottomAnchor.constraint(equalTo: card.bottomAnchor, constant: -24)
        ])

        card.accessibilityLabel = "GolfHelm. College golf team management and player development. Double tap to sign in."

        return card
    }

    private func buildBaseballHelmCard() -> UIView {
        let card = makeGlassCard()
        card.alpha = 0.5
        card.isUserInteractionEnabled = false

        let innerStack = UIStackView()
        innerStack.axis = .vertical
        innerStack.spacing = 4
        innerStack.translatesAutoresizingMaskIntoConstraints = false

        // Top row: logo + title
        let topRow = UIStackView()
        topRow.axis = .horizontal
        topRow.alignment = .center
        topRow.spacing = 14

        let logo = UIImageView()
        logo.image = loadBundleImage(named: "helm-baseball-logo-cropped")
        logo.contentMode = .scaleAspectFit
        logo.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            logo.widthAnchor.constraint(equalToConstant: 48),
            logo.heightAnchor.constraint(equalToConstant: 48)
        ])

        let titleStack = UIStackView()
        titleStack.axis = .vertical
        titleStack.spacing = 2

        let title = UILabel()
        title.text = "BaseballHelm"
        title.font = .preferredFont(forTextStyle: .title2)
        title.textColor = Design.textPrimary

        let tagline = UILabel()
        tagline.text = "Recruiting Platform"
        tagline.font = .systemFont(ofSize: 13, weight: .semibold)
        tagline.textColor = UIColor(red: 245.0/255.0, green: 158.0/255.0, blue: 11.0/255.0, alpha: 1.0)

        titleStack.addArrangedSubview(title)
        titleStack.addArrangedSubview(tagline)

        topRow.addArrangedSubview(logo)
        topRow.addArrangedSubview(titleStack)

        // Description
        let desc = UILabel()
        desc.text = "Find talent. Build champions. The complete college baseball recruiting platform."
        desc.font = .preferredFont(forTextStyle: .subheadline)
        desc.textColor = Design.textSecondary
        desc.numberOfLines = 0

        // Coming Soon pill
        let pill = UIView()
        pill.translatesAutoresizingMaskIntoConstraints = false
        pill.backgroundColor = UIColor(red: 245.0/255.0, green: 245.0/255.0, blue: 244.0/255.0, alpha: 1.0)
        pill.layer.cornerRadius = 16
        pill.layer.borderWidth = 1
        pill.layer.borderColor = UIColor.black.withAlphaComponent(0.04).cgColor

        let pillLabel = UILabel()
        pillLabel.text = "Launching Summer 2026"
        pillLabel.font = .preferredFont(forTextStyle: .subheadline)
        pillLabel.textColor = Design.textSecondary
        pillLabel.translatesAutoresizingMaskIntoConstraints = false
        pill.addSubview(pillLabel)

        NSLayoutConstraint.activate([
            pillLabel.topAnchor.constraint(equalTo: pill.topAnchor, constant: 8),
            pillLabel.bottomAnchor.constraint(equalTo: pill.bottomAnchor, constant: -8),
            pillLabel.leadingAnchor.constraint(equalTo: pill.leadingAnchor, constant: 20),
            pillLabel.trailingAnchor.constraint(equalTo: pill.trailingAnchor, constant: -20)
        ])

        let pillContainer = UIStackView(arrangedSubviews: [pill, UIView()])
        pillContainer.axis = .horizontal

        innerStack.addArrangedSubview(topRow)
        innerStack.setCustomSpacing(12, after: topRow)
        innerStack.addArrangedSubview(desc)
        innerStack.setCustomSpacing(16, after: desc)
        innerStack.addArrangedSubview(pillContainer)

        card.addSubview(innerStack)
        NSLayoutConstraint.activate([
            innerStack.topAnchor.constraint(equalTo: card.topAnchor, constant: 24),
            innerStack.leadingAnchor.constraint(equalTo: card.leadingAnchor, constant: 24),
            innerStack.trailingAnchor.constraint(equalTo: card.trailingAnchor, constant: -24),
            innerStack.bottomAnchor.constraint(equalTo: card.bottomAnchor, constant: -24)
        ])

        card.accessibilityLabel = "BaseballHelm. College baseball recruiting platform. Launching Summer 2026."
        card.accessibilityTraits = .notEnabled

        return card
    }

    // MARK: - Helpers

    private func makeGlassCard() -> UIView {
        let card = UIView()
        card.translatesAutoresizingMaskIntoConstraints = false

        // Frosted glass background
        let blur = UIVisualEffectView(effect: UIBlurEffect(style: .systemUltraThinMaterialLight))
        blur.translatesAutoresizingMaskIntoConstraints = false
        blur.layer.cornerRadius = Design.cardRadius
        blur.clipsToBounds = true
        card.addSubview(blur)
        NSLayoutConstraint.activate([
            blur.topAnchor.constraint(equalTo: card.topAnchor),
            blur.leadingAnchor.constraint(equalTo: card.leadingAnchor),
            blur.trailingAnchor.constraint(equalTo: card.trailingAnchor),
            blur.bottomAnchor.constraint(equalTo: card.bottomAnchor)
        ])

        // White overlay for the glass tint
        let tint = UIView()
        tint.translatesAutoresizingMaskIntoConstraints = false
        tint.backgroundColor = UIColor.white.withAlphaComponent(0.65)
        tint.layer.cornerRadius = Design.cardRadius
        tint.clipsToBounds = true
        card.addSubview(tint)
        NSLayoutConstraint.activate([
            tint.topAnchor.constraint(equalTo: card.topAnchor),
            tint.leadingAnchor.constraint(equalTo: card.leadingAnchor),
            tint.trailingAnchor.constraint(equalTo: card.trailingAnchor),
            tint.bottomAnchor.constraint(equalTo: card.bottomAnchor)
        ])

        card.layer.cornerRadius = Design.cardRadius
        card.layer.borderWidth = 1
        card.layer.borderColor = UIColor.white.withAlphaComponent(0.6).cgColor
        card.layer.shadowColor = UIColor.black.cgColor
        card.layer.shadowOpacity = 0.06
        card.layer.shadowRadius = 20
        card.layer.shadowOffset = CGSize(width: 0, height: 8)

        return card
    }

    private func buildFeaturesRow(_ features: [(icon: String, label: String)]) -> UIStackView {
        let row = UIStackView()
        row.axis = .horizontal
        row.distribution = .fillEqually
        row.spacing = 4

        for feature in features {
            let stack = UIStackView()
            stack.axis = .vertical
            stack.alignment = .center
            stack.spacing = 6

            // Icon circle background
            let iconBg = UIView()
            iconBg.translatesAutoresizingMaskIntoConstraints = false
            iconBg.backgroundColor = Design.primaryGreen.withAlphaComponent(0.1)
            iconBg.layer.cornerRadius = 18
            NSLayoutConstraint.activate([
                iconBg.widthAnchor.constraint(equalToConstant: 36),
                iconBg.heightAnchor.constraint(equalToConstant: 36)
            ])

            let icon = UIImageView()
            icon.image = UIImage(systemName: feature.icon, withConfiguration: UIImage.SymbolConfiguration(pointSize: 15, weight: .medium))
            icon.tintColor = Design.primaryGreen
            icon.contentMode = .scaleAspectFit
            icon.translatesAutoresizingMaskIntoConstraints = false
            iconBg.addSubview(icon)
            NSLayoutConstraint.activate([
                icon.centerXAnchor.constraint(equalTo: iconBg.centerXAnchor),
                icon.centerYAnchor.constraint(equalTo: iconBg.centerYAnchor)
            ])

            let label = UILabel()
            label.text = feature.label
            label.font = .systemFont(ofSize: 11, weight: .semibold)
            label.textColor = Design.textSecondary
            label.textAlignment = .center

            stack.addArrangedSubview(iconBg)
            stack.addArrangedSubview(label)
            row.addArrangedSubview(stack)
        }

        return row
    }

    // MARK: - Footer

    private func setupFooter() {
        footerLabel.text = "helmsportslabs.com"
        footerLabel.font = .systemFont(ofSize: 13, weight: .regular)
        footerLabel.textColor = Design.textSecondary.withAlphaComponent(0.4)
        footerLabel.textAlignment = .center
        footerLabel.translatesAutoresizingMaskIntoConstraints = false

        let footerContainer = UIView()
        footerContainer.translatesAutoresizingMaskIntoConstraints = false
        footerContainer.addSubview(footerLabel)

        NSLayoutConstraint.activate([
            footerLabel.topAnchor.constraint(equalTo: footerContainer.topAnchor, constant: 32),
            footerLabel.centerXAnchor.constraint(equalTo: footerContainer.centerXAnchor),
            footerLabel.bottomAnchor.constraint(equalTo: footerContainer.bottomAnchor, constant: -32)
        ])

        contentStack.addArrangedSubview(footerContainer)
        NSLayoutConstraint.activate([
            footerContainer.widthAnchor.constraint(equalTo: contentStack.widthAnchor)
        ])
    }

    // MARK: - Image Loading

    private func loadBundleImage(named name: String) -> UIImage? {
        if let path = Bundle.main.path(forResource: name, ofType: "png", inDirectory: "public") {
            return UIImage(contentsOfFile: path)
        }
        return UIImage(named: name)
    }

    // MARK: - Actions

    @objc private func golfSignInTapped() {
        let generator = UIImpactFeedbackGenerator(style: .medium)
        generator.impactOccurred()
        onGolfHelmSignIn?()
    }

    // MARK: - Entrance Animation

    private func animateEntrance() {
        // Orbs fade in
        for (index, orb) in orbViews.enumerated() {
            orb.alpha = 0
            UIView.animate(
                withDuration: 1.2,
                delay: Double(index) * 0.15,
                options: .curveEaseOut,
                animations: { orb.alpha = 1 }
            )
        }

        // Content elements stagger in
        for (index, element) in animatableElements.enumerated() {
            let delay = 0.1 + Double(index) * 0.12
            UIView.animate(
                withDuration: 0.7,
                delay: delay,
                usingSpringWithDamping: 0.78,
                initialSpringVelocity: 0,
                options: [.curveEaseOut],
                animations: {
                    element.alpha = 1
                    element.transform = .identity
                }
            )
        }
    }
}
