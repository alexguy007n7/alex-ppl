
local SollsakenUI = {}
SollsakenUI.__index = SollsakenUI

-- Services
local TweenService = game:GetService("TweenService")
local UserInputService = game:GetService("UserInputService")
local RunService = game:GetService("RunService")
local HttpService = game:GetService("HttpService")
local Players = game:GetService("Players")
local ContentProvider = game:GetService("ContentProvider")

-- Theme
local Theme = {
    Bg         = Color3.fromRGB(12, 12, 22),
    Sidebar    = Color3.fromRGB(18, 18, 32),
    Content    = Color3.fromRGB(16, 16, 28),
    Card       = Color3.fromRGB(26, 26, 46),
    CardHover  = Color3.fromRGB(34, 34, 58),
    Accent     = Color3.fromRGB(130, 80, 255),
    AccentDark = Color3.fromRGB(100, 55, 210),
    AccentDim  = Color3.fromRGB(60, 40, 120),
    Text       = Color3.fromRGB(225, 225, 242),
    TextDim    = Color3.fromRGB(140, 140, 170),
    TextMuted  = Color3.fromRGB(90, 90, 120),
    ToggleOff  = Color3.fromRGB(50, 50, 72),
    Border     = Color3.fromRGB(45, 45, 75),
    Slider     = Color3.fromRGB(40, 40, 65),
    Red        = Color3.fromRGB(255, 75, 75),
    Green      = Color3.fromRGB(75, 255, 130),
    Notif      = Color3.fromRGB(22, 22, 40),
    Shadow     = Color3.fromRGB(0, 0, 0),
}

local FONT = Font.fromEnum(Enum.Font.GothamBold)
local FONT_MEDIUM = Font.fromEnum(Enum.Font.GothamMedium)
local FONT_REGULAR = Font.fromEnum(Enum.Font.Gotham)

local IconMap = {
    ["battery-charging"]="⚡", ["scan-eye"]="👁", ["footprints"]="🏃",
    ["crosshair"]="⊕", ["sword"]="⚔", ["leaf"]="🌿", ["shield"]="🛡",
    ["user"]="👤", ["map"]="🗺", ["ban"]="🚫", ["dices"]="🎲",
    ["puzzle"]="🧩", ["bug"]="🐛", ["cog"]="⚙", ["copy"]="📋",
}

-- Utilities
local function tw(obj, props, dur)
    local t = TweenService:Create(obj, TweenInfo.new(dur or 0.25, Enum.EasingStyle.Quint, Enum.EasingDirection.Out), props)
    t:Play()
    return t
end

local function create(class, props)
    local inst = Instance.new(class)
    for k, v in pairs(props) do
        if k == "Parent" then continue end
        if typeof(v) == "Instance" then
            v.Parent = inst
        else
            inst[k] = v
        end
    end
    if props.Parent then inst.Parent = props.Parent end
    return inst
end

local function addCorner(parent, radius)
    return create("UICorner", {CornerRadius = UDim.new(0, radius or 8), Parent = parent})
end

local function addStroke(parent, color, thickness)
    return create("UIStroke", {Color = color or Theme.Border, Thickness = thickness or 1, Parent = parent, ApplyStrokeMode = Enum.ApplyStrokeMode.Border})
end

local function addPadding(parent, t, b, l, r)
    return create("UIPadding", {
        PaddingTop = UDim.new(0, t or 8), PaddingBottom = UDim.new(0, b or 8),
        PaddingLeft = UDim.new(0, l or 12), PaddingRight = UDim.new(0, r or 12),
        Parent = parent
    })
end

local function makeDraggable(gui, handle)
    local dragging, dragStart, startPos
    handle.InputBegan:Connect(function(input)
        if input.UserInputType == Enum.UserInputType.MouseButton1 or input.UserInputType == Enum.UserInputType.Touch then
            dragging = true
            dragStart = input.Position
            startPos = gui.Position
            input.Changed:Connect(function()
                if input.UserInputState == Enum.UserInputState.End then dragging = false end
            end)
        end
    end)
    UserInputService.InputChanged:Connect(function(input)
        if dragging and (input.UserInputType == Enum.UserInputType.MouseMovement or input.UserInputType == Enum.UserInputType.Touch) then
            local delta = input.Position - dragStart
            tw(gui, {Position = UDim2.new(startPos.X.Scale, startPos.X.Offset + delta.X, startPos.Y.Scale, startPos.Y.Offset + delta.Y)}, 0.08)
        end
    end)
end

-- ============================================================
-- MAIN LIBRARY
-- ============================================================

function CatsakenUI:CreateWindow(config)
    local Library = setmetatable({}, CatsakenUI)
    Library.Flags = {}
    Library._tabs = {}
    Library._activeTab = nil
    Library._visible = true
    Library._configSaving = config.ConfigurationSaving or {Enabled = false}
    Library._connections = {}
    Library._toggleKey = config.ToggleUIKeybind and Enum.KeyCode[config.ToggleUIKeybind] or Enum.KeyCode.K

    local player = Players.LocalPlayer
    local screenGui = create("ScreenGui", {
        Name = "CatsakenUI",
        ResetOnSpawn = false,
        ZIndexBehavior = Enum.ZIndexBehavior.Sibling,
        IgnoreGuiInset = true,
        DisplayOrder = 999,
    })

    -- try to parent safely
    pcall(function()
        if syn and syn.protect_gui then syn.protect_gui(screenGui) end
    end)
    local ok = pcall(function() screenGui.Parent = game:GetService("CoreGui") end)
    if not ok then
        pcall(function() screenGui.Parent = gethui and gethui() or player.PlayerGui end)
    end

    Library._screenGui = screenGui

    -- ========================
    -- NOTIFICATION CONTAINER
    -- ========================
    local notifHolder = create("Frame", {
        Name = "Notifications",
        BackgroundTransparency = 1,
        AnchorPoint = Vector2.new(1, 0),
        Position = UDim2.new(1, -20, 0, 20),
        Size = UDim2.new(0, 300, 1, -40),
        Parent = screenGui,
    })
    create("UIListLayout", {
        SortOrder = Enum.SortOrder.LayoutOrder,
        Padding = UDim.new(0, 8),
        HorizontalAlignment = Enum.HorizontalAlignment.Right,
        VerticalAlignment = Enum.VerticalAlignment.Bottom,
        Parent = notifHolder,
    })

    Library._notifHolder = notifHolder

    -- ========================
    -- LOADING SCREEN
    -- ========================
    local loadingScreen = create("Frame", {
        Name = "Loading",
        BackgroundColor3 = Theme.Bg,
        BorderSizePixel = 0,
        AnchorPoint = Vector2.new(0.5, 0.5),
        Position = UDim2.new(0.5, 0, 0.5, 0),
        Size = UDim2.new(0, 320, 0, 180),
        Parent = screenGui,
    })
    addCorner(loadingScreen, 14)
    addStroke(loadingScreen, Theme.Accent, 2)

    local loadTitle = create("TextLabel", {
        Text = config.LoadingTitle or "Loading...",
        FontFace = FONT,
        TextSize = 22,
        TextColor3 = Theme.Text,
        BackgroundTransparency = 1,
        Size = UDim2.new(1, 0, 0, 30),
        Position = UDim2.new(0, 0, 0.3, 0),
        TextXAlignment = Enum.TextXAlignment.Center,
        Parent = loadingScreen,
    })
    local loadSub = create("TextLabel", {
        Text = config.LoadingSubtitle or "",
        FontFace = FONT_REGULAR,
        TextSize = 14,
        TextColor3 = Theme.TextDim,
        BackgroundTransparency = 1,
        Size = UDim2.new(1, 0, 0, 20),
        Position = UDim2.new(0, 0, 0.55, 0),
        TextXAlignment = Enum.TextXAlignment.Center,
        Parent = loadingScreen,
    })

    -- Loading bar
    local barBg = create("Frame", {
        BackgroundColor3 = Theme.Slider,
        BorderSizePixel = 0,
        AnchorPoint = Vector2.new(0.5, 0),
        Position = UDim2.new(0.5, 0, 0.75, 0),
        Size = UDim2.new(0.7, 0, 0, 4),
        Parent = loadingScreen,
    })
    addCorner(barBg, 2)
    local barFill = create("Frame", {
        BackgroundColor3 = Theme.Accent,
        BorderSizePixel = 0,
        Size = UDim2.new(0, 0, 1, 0),
        Parent = barBg,
    })
    addCorner(barFill, 2)

    -- Animate loading
    task.spawn(function()
        tw(barFill, {Size = UDim2.new(0.5, 0, 1, 0)}, 0.8)
        task.wait(0.9)
        tw(barFill, {Size = UDim2.new(1, 0, 1, 0)}, 0.6)
        task.wait(0.7)
        tw(loadingScreen, {BackgroundTransparency = 1}, 0.3)
        tw(loadTitle, {TextTransparency = 1}, 0.3)
        tw(loadSub, {TextTransparency = 1}, 0.3)
        tw(barBg, {BackgroundTransparency = 1}, 0.3)
        tw(barFill, {BackgroundTransparency = 1}, 0.3)
        task.wait(0.35)
        loadingScreen:Destroy()
    end)

    -- ========================
    -- MAIN WINDOW
    -- ========================
    local mainFrame = create("Frame", {
        Name = "Main",
        BackgroundColor3 = Theme.Bg,
        BorderSizePixel = 0,
        AnchorPoint = Vector2.new(0.5, 0.5),
        Position = UDim2.new(0.5, 0, 0.5, 0),
        Size = UDim2.new(0, 580, 0, 420),
        ClipsDescendants = true,
        Parent = screenGui,
    })
    addCorner(mainFrame, 12)
    addStroke(mainFrame, Theme.Border, 1)

    -- Drop shadow
    create("ImageLabel", {
        Name = "Shadow",
        BackgroundTransparency = 1,
        Position = UDim2.new(0, -15, 0, -15),
        Size = UDim2.new(1, 30, 1, 30),
        ZIndex = -1,
        Image = "rbxassetid://5554236805",
        ImageColor3 = Color3.new(0, 0, 0),
        ImageTransparency = 0.4,
        ScaleType = Enum.ScaleType.Slice,
        SliceCenter = Rect.new(23, 23, 277, 277),
        Parent = mainFrame,
    })

    Library._mainFrame = mainFrame

    -- ========================
    -- TITLE BAR
    -- ========================
    local titleBar = create("Frame", {
        Name = "TitleBar",
        BackgroundColor3 = Theme.Sidebar,
        BorderSizePixel = 0,
        Size = UDim2.new(1, 0, 0, 40),
        Parent = mainFrame,
    })

    local titleText = create("TextLabel", {
        Text = "  🐱 " .. (config.Name or "CatsakenUI"),
        FontFace = FONT,
        TextSize = 16,
        TextColor3 = Theme.Text,
        BackgroundTransparency = 1,
        Size = UDim2.new(0.7, 0, 1, 0),
        TextXAlignment = Enum.TextXAlignment.Left,
        Parent = titleBar,
    })
    addPadding(titleText, 0, 0, 10, 0)

    -- Close / Minimize buttons
    local closeBtn = create("TextButton", {
        Text = "✕",
        FontFace = FONT,
        TextSize = 16,
        TextColor3 = Theme.TextDim,
        BackgroundTransparency = 1,
        AnchorPoint = Vector2.new(1, 0.5),
        Position = UDim2.new(1, -8, 0.5, 0),
        Size = UDim2.new(0, 30, 0, 30),
        Parent = titleBar,
    })
    closeBtn.MouseButton1Click:Connect(function()
        Library._visible = false
        tw(mainFrame, {Position = UDim2.new(0.5, 0, 0.5, 20), GroupTransparency = 0}, 0.01)
        mainFrame.Visible = false
    end)

    makeDraggable(mainFrame, titleBar)

    -- ========================
    -- SIDEBAR
    -- ========================
    local sidebar = create("Frame", {
        Name = "Sidebar",
        BackgroundColor3 = Theme.Sidebar,
        BorderSizePixel = 0,
        Position = UDim2.new(0, 0, 0, 40),
        Size = UDim2.new(0, 155, 1, -40),
        Parent = mainFrame,
    })

    local tabScroll = create("ScrollingFrame", {
        Name = "TabList",
        BackgroundTransparency = 1,
        BorderSizePixel = 0,
        Position = UDim2.new(0, 0, 0, 8),
        Size = UDim2.new(1, 0, 1, -8),
        ScrollBarThickness = 2,
        ScrollBarImageColor3 = Theme.Accent,
        CanvasSize = UDim2.new(0, 0, 0, 0),
        AutomaticCanvasSize = Enum.AutomaticSize.Y,
        Parent = sidebar,
    })
    create("UIListLayout", {
        SortOrder = Enum.SortOrder.LayoutOrder,
        Padding = UDim.new(0, 2),
        Parent = tabScroll,
    })
    addPadding(tabScroll, 4, 4, 6, 6)

    -- Divider line
    create("Frame", {
        BackgroundColor3 = Theme.Border,
        BorderSizePixel = 0,
        Position = UDim2.new(0, 155, 0, 40),
        Size = UDim2.new(0, 1, 1, -40),
        Parent = mainFrame,
    })

    -- ========================
    -- CONTENT AREA
    -- ========================
    local contentHolder = create("Frame", {
        Name = "Content",
        BackgroundColor3 = Theme.Content,
        BorderSizePixel = 0,
        Position = UDim2.new(0, 156, 0, 40),
        Size = UDim2.new(1, -156, 1, -40),
        ClipsDescendants = true,
        Parent = mainFrame,
    })

    Library._tabScroll = tabScroll
    Library._contentHolder = contentHolder

    -- ========================
    -- TAB CREATION
    -- ========================
    function Library:CreateTab(name, icon)
        local tab = {}
        tab._name = name
        tab._elements = {}

        local iconStr = IconMap[icon] or "•"

        -- Tab button in sidebar
        local tabBtn = create("TextButton", {
            Name = name,
            Text = "",
            BackgroundColor3 = Theme.Sidebar,
            BorderSizePixel = 0,
            Size = UDim2.new(1, 0, 0, 34),
            AutoButtonColor = false,
            Parent = tabScroll,
        })
        addCorner(tabBtn, 6)

        local tabLabel = create("TextLabel", {
            Text = iconStr .. "  " .. name,
            FontFace = FONT_MEDIUM,
            TextSize = 13,
            TextColor3 = Theme.TextDim,
            BackgroundTransparency = 1,
            Size = UDim2.new(1, 0, 1, 0),
            TextXAlignment = Enum.TextXAlignment.Left,
            TextTruncate = Enum.TextTruncate.AtEnd,
            Parent = tabBtn,
        })
        addPadding(tabLabel, 0, 0, 10, 0)

        -- Accent indicator
        local indicator = create("Frame", {
            BackgroundColor3 = Theme.Accent,
            BorderSizePixel = 0,
            AnchorPoint = Vector2.new(0, 0.5),
            Position = UDim2.new(0, 0, 0.5, 0),
            Size = UDim2.new(0, 3, 0, 0),
            Parent = tabBtn,
        })
        addCorner(indicator, 2)

        -- Content page (ScrollingFrame)
        local page = create("ScrollingFrame", {
            Name = name,
            BackgroundTransparency = 1,
            BorderSizePixel = 0,
            Position = UDim2.new(0, 0, 0, 0),
            Size = UDim2.new(1, 0, 1, 0),
            ScrollBarThickness = 3,
            ScrollBarImageColor3 = Theme.AccentDim,
            CanvasSize = UDim2.new(0, 0, 0, 0),
            AutomaticCanvasSize = Enum.AutomaticSize.Y,
            Visible = false,
            Parent = contentHolder,
        })
        create("UIListLayout", {
            SortOrder = Enum.SortOrder.LayoutOrder,
            Padding = UDim.new(0, 6),
            Parent = page,
        })
        addPadding(page, 10, 10, 14, 14)

        tab._page = page
        tab._btn = tabBtn

        local function selectTab()
            for _, t in ipairs(Library._tabs) do
                t._page.Visible = false
                tw(t._btn, {BackgroundColor3 = Theme.Sidebar}, 0.2)
                t._btn.TextLabel.TextColor3 = Theme.TextDim
                -- hide indicator
                local ind = t._btn:FindFirstChild("Frame")
                if ind then tw(ind, {Size = UDim2.new(0, 3, 0, 0)}, 0.2) end
            end
            page.Visible = true
            tw(tabBtn, {BackgroundColor3 = Theme.Card}, 0.2)
            tabLabel.TextColor3 = Theme.Text
            tw(indicator, {Size = UDim2.new(0, 3, 0, 18)}, 0.25)
            Library._activeTab = tab
        end

        tabBtn.MouseButton1Click:Connect(selectTab)
        tabBtn.MouseEnter:Connect(function()
            if Library._activeTab ~= tab then
                tw(tabBtn, {BackgroundColor3 = Theme.CardHover}, 0.15)
            end
        end)
        tabBtn.MouseLeave:Connect(function()
            if Library._activeTab ~= tab then
                tw(tabBtn, {BackgroundColor3 = Theme.Sidebar}, 0.15)
            end
        end)

        table.insert(Library._tabs, tab)
        if #Library._tabs == 1 then selectTab() end

        -- ==========================
        -- SECTION
        -- ==========================
        function tab:CreateSection(sectionName)
            local sec = create("Frame", {
                BackgroundTransparency = 1,
                Size = UDim2.new(1, 0, 0, 28),
                Parent = page,
            })
            create("TextLabel", {
                Text = string.upper(sectionName),
                FontFace = FONT,
                TextSize = 11,
                TextColor3 = Theme.AccentDim,
                BackgroundTransparency = 1,
                Size = UDim2.new(1, 0, 1, 0),
                TextXAlignment = Enum.TextXAlignment.Left,
                Parent = sec,
            })
            addPadding(sec, 6, 0, 2, 0)
        end

        -- ==========================
        -- TOGGLE
        -- ==========================
        function tab:CreateToggle(cfg)
            local toggle = {Type = "Toggle", CurrentValue = cfg.CurrentValue or false}

            local frame = create("Frame", {
                BackgroundColor3 = Theme.Card,
                BorderSizePixel = 0,
                Size = UDim2.new(1, 0, 0, 38),
                Parent = page,
            })
            addCorner(frame, 8)

            local label = create("TextLabel", {
                Text = cfg.Name or "Toggle",
                FontFace = FONT_MEDIUM,
                TextSize = 13,
                TextColor3 = Theme.Text,
                BackgroundTransparency = 1,
                Position = UDim2.new(0, 12, 0, 0),
                Size = UDim2.new(1, -60, 1, 0),
                TextXAlignment = Enum.TextXAlignment.Left,
                TextTruncate = Enum.TextTruncate.AtEnd,
                Parent = frame,
            })

            -- Toggle switch
            local switchBg = create("Frame", {
                BackgroundColor3 = toggle.CurrentValue and Theme.Accent or Theme.ToggleOff,
                BorderSizePixel = 0,
                AnchorPoint = Vector2.new(1, 0.5),
                Position = UDim2.new(1, -10, 0.5, 0),
                Size = UDim2.new(0, 38, 0, 20),
                Parent = frame,
            })
            addCorner(switchBg, 10)

            local knob = create("Frame", {
                BackgroundColor3 = Color3.new(1, 1, 1),
                BorderSizePixel = 0,
                AnchorPoint = Vector2.new(0, 0.5),
                Position = toggle.CurrentValue and UDim2.new(1, -17, 0.5, 0) or UDim2.new(0, 3, 0.5, 0),
                Size = UDim2.new(0, 14, 0, 14),
                Parent = switchBg,
            })
            addCorner(knob, 7)

            local function updateVisual()
                if toggle.CurrentValue then
                    tw(switchBg, {BackgroundColor3 = Theme.Accent}, 0.2)
                    tw(knob, {Position = UDim2.new(1, -17, 0.5, 0)}, 0.2)
                else
                    tw(switchBg, {BackgroundColor3 = Theme.ToggleOff}, 0.2)
                    tw(knob, {Position = UDim2.new(0, 3, 0.5, 0)}, 0.2)
                end
            end

            function toggle:Set(val)
                toggle.CurrentValue = val
                updateVisual()
                if cfg.Callback then task.spawn(cfg.Callback, val) end
            end

            local btn = create("TextButton", {
                Text = "",
                BackgroundTransparency = 1,
                Size = UDim2.new(1, 0, 1, 0),
                Parent = frame,
            })
            btn.MouseButton1Click:Connect(function()
                toggle:Set(not toggle.CurrentValue)
            end)

            if cfg.Flag then Library.Flags[cfg.Flag] = toggle end
            return toggle
        end

        -- ==========================
        -- BUTTON
        -- ==========================
        function tab:CreateButton(cfg)
            local frame = create("Frame", {
                BackgroundColor3 = Theme.Card,
                BorderSizePixel = 0,
                Size = UDim2.new(1, 0, 0, 36),
                Parent = page,
            })
            addCorner(frame, 8)

            local btn = create("TextButton", {
                Text = cfg.Name or "Button",
                FontFace = FONT_MEDIUM,
                TextSize = 13,
                TextColor3 = Theme.Text,
                BackgroundColor3 = Theme.AccentDark,
                BorderSizePixel = 0,
                AnchorPoint = Vector2.new(0.5, 0.5),
                Position = UDim2.new(0.5, 0, 0.5, 0),
                Size = UDim2.new(1, -16, 0, 28),
                AutoButtonColor = false,
                Parent = frame,
            })
            addCorner(btn, 6)

            btn.MouseEnter:Connect(function() tw(btn, {BackgroundColor3 = Theme.Accent}, 0.15) end)
            btn.MouseLeave:Connect(function() tw(btn, {BackgroundColor3 = Theme.AccentDark}, 0.15) end)
            btn.MouseButton1Click:Connect(function()
                tw(btn, {BackgroundColor3 = Color3.fromRGB(180, 140, 255)}, 0.08)
                task.wait(0.1)
                tw(btn, {BackgroundColor3 = Theme.AccentDark}, 0.15)
                if cfg.Callback then task.spawn(cfg.Callback) end
            end)
        end

        -- ==========================
        -- SLIDER
        -- ==========================
        function tab:CreateSlider(cfg)
            local slider = {Type = "Slider", CurrentValue = cfg.CurrentValue or cfg.Range[1]}
            local minVal, maxVal = cfg.Range[1], cfg.Range[2]
            local increment = cfg.Increment or 1

            local frame = create("Frame", {
                BackgroundColor3 = Theme.Card,
                BorderSizePixel = 0,
                Size = UDim2.new(1, 0, 0, 52),
                Parent = page,
            })
            addCorner(frame, 8)

            local label = create("TextLabel", {
                Text = cfg.Name or "Slider",
                FontFace = FONT_MEDIUM,
                TextSize = 13,
                TextColor3 = Theme.Text,
                BackgroundTransparency = 1,
                Position = UDim2.new(0, 12, 0, 4),
                Size = UDim2.new(0.6, 0, 0, 20),
                TextXAlignment = Enum.TextXAlignment.Left,
                Parent = frame,
            })

            local valLabel = create("TextLabel", {
                Text = tostring(slider.CurrentValue) .. (cfg.Suffix or ""),
                FontFace = FONT,
                TextSize = 12,
                TextColor3 = Theme.Accent,
                BackgroundTransparency = 1,
                AnchorPoint = Vector2.new(1, 0),
                Position = UDim2.new(1, -12, 0, 4),
                Size = UDim2.new(0.3, 0, 0, 20),
                TextXAlignment = Enum.TextXAlignment.Right,
                Parent = frame,
            })

            local trackBg = create("Frame", {
                BackgroundColor3 = Theme.Slider,
                BorderSizePixel = 0,
                AnchorPoint = Vector2.new(0.5, 0),
                Position = UDim2.new(0.5, 0, 0, 30),
                Size = UDim2.new(1, -24, 0, 8),
                Parent = frame,
            })
            addCorner(trackBg, 4)

            local pct = math.clamp((slider.CurrentValue - minVal) / (maxVal - minVal), 0, 1)
            local trackFill = create("Frame", {
                BackgroundColor3 = Theme.Accent,
                BorderSizePixel = 0,
                Size = UDim2.new(pct, 0, 1, 0),
                Parent = trackBg,
            })
            addCorner(trackFill, 4)

            local thumbFrame = create("Frame", {
                BackgroundColor3 = Color3.new(1, 1, 1),
                BorderSizePixel = 0,
                AnchorPoint = Vector2.new(0.5, 0.5),
                Position = UDim2.new(pct, 0, 0.5, 0),
                Size = UDim2.new(0, 14, 0, 14),
                ZIndex = 2,
                Parent = trackBg,
            })
            addCorner(thumbFrame, 7)

            local function updateSlider(val)
                val = math.clamp(val, minVal, maxVal)
                val = math.floor(val / increment + 0.5) * increment
                -- Round to avoid floating point issues
                val = tonumber(string.format("%." .. (math.max(0, #tostring(increment) - #tostring(math.floor(increment)) - 1)) .. "f", val)) or val
                slider.CurrentValue = val
                local p = math.clamp((val - minVal) / (maxVal - minVal), 0, 1)
                tw(trackFill, {Size = UDim2.new(p, 0, 1, 0)}, 0.08)
                tw(thumbFrame, {Position = UDim2.new(p, 0, 0.5, 0)}, 0.08)
                valLabel.Text = tostring(val) .. (cfg.Suffix or "")
                if cfg.Callback then task.spawn(cfg.Callback, val) end
            end

            function slider:Set(val)
                updateSlider(val)
            end

            local dragging = false
            local inputBtn = create("TextButton", {
                Text = "",
                BackgroundTransparency = 1,
                Size = UDim2.new(1, 0, 1, 0),
                ZIndex = 3,
                Parent = trackBg,
            })

            inputBtn.MouseButton1Down:Connect(function()
                dragging = true
            end)

            UserInputService.InputEnded:Connect(function(input)
                if input.UserInputType == Enum.UserInputType.MouseButton1 or input.UserInputType == Enum.UserInputType.Touch then
                    dragging = false
                end
            end)

            local conn = RunService.RenderStepped:Connect(function()
                if dragging then
                    local mouse = UserInputService:GetMouseLocation()
                    local absPos = trackBg.AbsolutePosition
                    local absSize = trackBg.AbsoluteSize
                    local rel = math.clamp((mouse.X - absPos.X) / absSize.X, 0, 1)
                    local val = minVal + (maxVal - minVal) * rel
                    updateSlider(val)
                end
            end)
            table.insert(Library._connections, conn)

            if cfg.Flag then Library.Flags[cfg.Flag] = slider end
            return slider
        end

        -- ==========================
        -- DROPDOWN
        -- ==========================
        function tab:CreateDropdown(cfg)
            local dropdown = {
                Type = "Dropdown",
                CurrentOption = type(cfg.CurrentOption) == "table" and cfg.CurrentOption or {cfg.CurrentOption or ""},
                CurrentValue = nil,
                __DropdownOptions = {},
                _multi = cfg.MultipleOptions or false,
            }
            dropdown.CurrentValue = dropdown.CurrentOption[1]

            local frame = create("Frame", {
                BackgroundColor3 = Theme.Card,
                BorderSizePixel = 0,
                Size = UDim2.new(1, 0, 0, 38),
                ClipsDescendants = true,
                Parent = page,
            })
            addCorner(frame, 8)

            local headerBtn = create("TextButton", {
                Text = "",
                BackgroundTransparency = 1,
                Size = UDim2.new(1, 0, 0, 38),
                Parent = frame,
            })

            local titleLabel = create("TextLabel", {
                Text = cfg.Name or "Dropdown",
                FontFace = FONT_MEDIUM,
                TextSize = 13,
                TextColor3 = Theme.Text,
                BackgroundTransparency = 1,
                Position = UDim2.new(0, 12, 0, 0),
                Size = UDim2.new(0.6, 0, 0, 38),
                TextXAlignment = Enum.TextXAlignment.Left,
                TextTruncate = Enum.TextTruncate.AtEnd,
                Parent = frame,
            })

            local selLabel = create("TextLabel", {
                Text = table.concat(dropdown.CurrentOption, ", "),
                FontFace = FONT_REGULAR,
                TextSize = 12,
                TextColor3 = Theme.Accent,
                BackgroundTransparency = 1,
                AnchorPoint = Vector2.new(1, 0),
                Position = UDim2.new(1, -30, 0, 0),
                Size = UDim2.new(0.35, 0, 0, 38),
                TextXAlignment = Enum.TextXAlignment.Right,
                TextTruncate = Enum.TextTruncate.AtEnd,
                Parent = frame,
            })

            local arrow = create("TextLabel", {
                Text = "▼",
                FontFace = FONT,
                TextSize = 10,
                TextColor3 = Theme.TextDim,
                BackgroundTransparency = 1,
                AnchorPoint = Vector2.new(1, 0.5),
                Position = UDim2.new(1, -10, 0, 19),
                Size = UDim2.new(0, 20, 0, 20),
                Parent = frame,
            })

            local optionList = create("Frame", {
                BackgroundTransparency = 1,
                Position = UDim2.new(0, 0, 0, 40),
                Size = UDim2.new(1, 0, 0, 0),
                AutomaticSize = Enum.AutomaticSize.Y,
                Parent = frame,
            })
            create("UIListLayout", {
                SortOrder = Enum.SortOrder.LayoutOrder,
                Padding = UDim.new(0, 2),
                Parent = optionList,
            })
            addPadding(optionList, 0, 6, 6, 6)

            local isOpen = false

            local function refreshOptions()
                for _, c in optionList:GetChildren() do
                    if c:IsA("TextButton") then c:Destroy() end
                end
                dropdown.__DropdownOptions = {}

                for idx, opt in ipairs(cfg.Options) do
                    local isSelected = table.find(dropdown.CurrentOption, opt) ~= nil

                    local optBtn = create("TextButton", {
                        Name = opt,
                        Text = "",
                        BackgroundColor3 = isSelected and Theme.AccentDim or Theme.CardHover,
                        BorderSizePixel = 0,
                        Size = UDim2.new(1, 0, 0, 28),
                        AutoButtonColor = false,
                        Parent = optionList,
                    })
                    addCorner(optBtn, 6)

                    local optLabel = create("TextLabel", {
                        Name = "Title",
                        Text = opt,
                        FontFace = FONT_REGULAR,
                        TextSize = 12,
                        TextColor3 = isSelected and Theme.Text or Theme.TextDim,
                        BackgroundTransparency = 1,
                        Size = UDim2.new(1, 0, 1, 0),
                        Parent = optBtn,
                    })
                    addPadding(optLabel, 0, 0, 8, 0)

                    -- Store reference for __DropdownOptions
                    dropdown.__DropdownOptions[idx] = {Title = optLabel, Button = optBtn}

                    optBtn.MouseEnter:Connect(function()
                        if not table.find(dropdown.CurrentOption, opt) then
                            tw(optBtn, {BackgroundColor3 = Theme.Slider}, 0.1)
                        end
                    end)
                    optBtn.MouseLeave:Connect(function()
                        if not table.find(dropdown.CurrentOption, opt) then
                            tw(optBtn, {BackgroundColor3 = Theme.CardHover}, 0.1)
                        end
                    end)

                    optBtn.MouseButton1Click:Connect(function()
                        if dropdown._multi then
                            local idx2 = table.find(dropdown.CurrentOption, opt)
                            if idx2 then
                                table.remove(dropdown.CurrentOption, idx2)
                                tw(optBtn, {BackgroundColor3 = Theme.CardHover}, 0.15)
                                optLabel.TextColor3 = Theme.TextDim
                            else
                                table.insert(dropdown.CurrentOption, opt)
                                tw(optBtn, {BackgroundColor3 = Theme.AccentDim}, 0.15)
                                optLabel.TextColor3 = Theme.Text
                            end
                        else
                            dropdown.CurrentOption = {opt}
                            for i2, ref in dropdown.__DropdownOptions do
                                tw(ref.Button, {BackgroundColor3 = Theme.CardHover}, 0.15)
                                ref.Title.TextColor3 = Theme.TextDim
                            end
                            tw(optBtn, {BackgroundColor3 = Theme.AccentDim}, 0.15)
                            optLabel.TextColor3 = Theme.Text
                        end
                        dropdown.CurrentValue = dropdown.CurrentOption[1]
                        selLabel.Text = table.concat(dropdown.CurrentOption, ", ")
                        if cfg.Callback then task.spawn(cfg.Callback, dropdown.CurrentOption) end
                    end)
                end
            end

            refreshOptions()

            local function toggleOpen()
                isOpen = not isOpen
                if isOpen then
                    local totalH = 40 + #cfg.Options * 30 + 10
                    tw(frame, {Size = UDim2.new(1, 0, 0, math.min(totalH, 250))}, 0.25)
                    arrow.Text = "▲"
                else
                    tw(frame, {Size = UDim2.new(1, 0, 0, 38)}, 0.25)
                    arrow.Text = "▼"
                end
            end

            headerBtn.MouseButton1Click:Connect(toggleOpen)

            function dropdown:SetTitle(text)
                titleLabel.Text = text
            end

            if cfg.Flag then Library.Flags[cfg.Flag] = dropdown end
            return dropdown
        end

        -- ==========================
        -- INPUT
        -- ==========================
        function tab:CreateInput(cfg)
            local input = {Type = "Input", CurrentValue = cfg.CurrentValue or ""}

            local frame = create("Frame", {
                BackgroundColor3 = Theme.Card,
                BorderSizePixel = 0,
                Size = UDim2.new(1, 0, 0, 38),
                Parent = page,
            })
            addCorner(frame, 8)

            local label = create("TextLabel", {
                Text = cfg.Name or "Input",
                FontFace = FONT_MEDIUM,
                TextSize = 13,
                TextColor3 = Theme.Text,
                BackgroundTransparency = 1,
                Position = UDim2.new(0, 12, 0, 0),
                Size = UDim2.new(0.45, 0, 1, 0),
                TextXAlignment = Enum.TextXAlignment.Left,
                Parent = frame,
            })

            local box = create("TextBox", {
                Text = cfg.CurrentValue or "",
                PlaceholderText = cfg.PlaceholderText or "",
                PlaceholderColor3 = Theme.TextMuted,
                FontFace = FONT_REGULAR,
                TextSize = 12,
                TextColor3 = Theme.Text,
                BackgroundColor3 = Theme.Slider,
                BorderSizePixel = 0,
                AnchorPoint = Vector2.new(1, 0.5),
                Position = UDim2.new(1, -8, 0.5, 0),
                Size = UDim2.new(0.48, 0, 0, 26),
                ClearTextOnFocus = false,
                Parent = frame,
            })
            addCorner(box, 6)
            addPadding(box, 0, 0, 6, 6)

            box.FocusLost:Connect(function()
                input.CurrentValue = box.Text
                if cfg.Callback then task.spawn(cfg.Callback, box.Text) end
                if cfg.RemoveTextAfterFocusLost then box.Text = "" end
            end)

            if cfg.Flag then Library.Flags[cfg.Flag] = input end
            return input
        end

        -- ==========================
        -- COLOR PICKER
        -- ==========================
        function tab:CreateColorPicker(cfg)
            local picker = {Type = "ColorPicker", Color = cfg.Color or Color3.new(1, 1, 1)}

            local frame = create("Frame", {
                BackgroundColor3 = Theme.Card,
                BorderSizePixel = 0,
                Size = UDim2.new(1, 0, 0, 38),
                ClipsDescendants = true,
                Parent = page,
            })
            addCorner(frame, 8)

            local label = create("TextLabel", {
                Text = cfg.Name or "Color",
                FontFace = FONT_MEDIUM,
                TextSize = 13,
                TextColor3 = Theme.Text,
                BackgroundTransparency = 1,
                Position = UDim2.new(0, 12, 0, 0),
                Size = UDim2.new(0.7, 0, 0, 38),
                TextXAlignment = Enum.TextXAlignment.Left,
                Parent = frame,
            })

            local preview = create("Frame", {
                BackgroundColor3 = picker.Color,
                BorderSizePixel = 0,
                AnchorPoint = Vector2.new(1, 0.5),
                Position = UDim2.new(1, -12, 0, 19),
                Size = UDim2.new(0, 24, 0, 24),
                Parent = frame,
            })
            addCorner(preview, 6)
            addStroke(preview, Theme.Border, 1)

            -- Expand panel for RGB sliders
            local isOpen = false
            local r, g, b = picker.Color.R, picker.Color.G, picker.Color.B

            local sliderPanel = create("Frame", {
                BackgroundTransparency = 1,
                Position = UDim2.new(0, 0, 0, 42),
                Size = UDim2.new(1, 0, 0, 80),
                Parent = frame,
            })
            addPadding(sliderPanel, 0, 0, 12, 12)

            local function makeRGBSlider(labelText, initVal, ypos, onChange)
                local slBg = create("Frame", {
                    BackgroundColor3 = Theme.Slider,
                    BorderSizePixel = 0,
                    Position = UDim2.new(0.12, 0, 0, ypos),
                    Size = UDim2.new(0.88, -12, 0, 8),
                    Parent = sliderPanel,
                })
                addCorner(slBg, 4)

                local slFill = create("Frame", {
                    BackgroundColor3 = Theme.Accent,
                    BorderSizePixel = 0,
                    Size = UDim2.new(initVal, 0, 1, 0),
                    Parent = slBg,
                })
                addCorner(slFill, 4)

                create("TextLabel", {
                    Text = labelText,
                    FontFace = FONT,
                    TextSize = 11,
                    TextColor3 = Theme.TextDim,
                    BackgroundTransparency = 1,
                    Position = UDim2.new(0, 0, 0, ypos - 2),
                    Size = UDim2.new(0.1, 0, 0, 12),
                    Parent = sliderPanel,
                })

                local slBtn = create("TextButton", {
                    Text = "",
                    BackgroundTransparency = 1,
                    Size = UDim2.new(1, 0, 1, 0),
                    ZIndex = 3,
                    Parent = slBg
                })

                local dragging = false
                slBtn.MouseButton1Down:Connect(function() dragging = true end)
                UserInputService.InputEnded:Connect(function(inp)
                    if inp.UserInputType == Enum.UserInputType.MouseButton1 then dragging = false end
                end)

                local conn = RunService.RenderStepped:Connect(function()
                    if dragging then
                        local mouse = UserInputService:GetMouseLocation()
                        local rel = math.clamp((mouse.X - slBg.AbsolutePosition.X) / slBg.AbsoluteSize.X, 0, 1)
                        slFill.Size = UDim2.new(rel, 0, 1, 0)
                        onChange(rel)
                    end
                end)
                table.insert(Library._connections, conn)

                return {Fill = slFill}
            end

            local function updateColor()
                picker.Color = Color3.new(r, g, b)
                preview.BackgroundColor3 = picker.Color
                if cfg.Callback then task.spawn(cfg.Callback, picker.Color) end
            end

            makeRGBSlider("R", r, 4, function(v) r = v; updateColor() end)
            makeRGBSlider("G", g, 30, function(v) g = v; updateColor() end)
            makeRGBSlider("B", b, 56, function(v) b = v; updateColor() end)

            local headerBtn = create("TextButton", {
                Text = "",
                BackgroundTransparency = 1,
                Size = UDim2.new(1, 0, 0, 38),
                Parent = frame,
            })
            headerBtn.MouseButton1Click:Connect(function()
                isOpen = not isOpen
                tw(frame, {Size = UDim2.new(1, 0, 0, isOpen and 128 or 38)}, 0.25)
            end)

            if cfg.Flag then Library.Flags[cfg.Flag] = picker end
            return picker
        end

        -- ==========================
        -- KEYBIND
        -- ==========================
        function tab:CreateKeybind(cfg)
            local keybind = {Type = "Keybind", CurrentKeybind = cfg.CurrentKeybind or ""}

            local frame = create("Frame", {
                BackgroundColor3 = Theme.Card,
                BorderSizePixel = 0,
                Size = UDim2.new(1, 0, 0, 38),
                Parent = page,
            })
            addCorner(frame, 8)

            local label = create("TextLabel", {
                Text = cfg.Name or "Keybind",
                FontFace = FONT_MEDIUM,
                TextSize = 13,
                TextColor3 = Theme.Text,
                BackgroundTransparency = 1,
                Position = UDim2.new(0, 12, 0, 0),
                Size = UDim2.new(0.6, 0, 1, 0),
                TextXAlignment = Enum.TextXAlignment.Left,
                Parent = frame,
            })

            local bindBtn = create("TextButton", {
                Text = "[" .. keybind.CurrentKeybind .. "]",
                FontFace = FONT,
                TextSize = 12,
                TextColor3 = Theme.Accent,
                BackgroundColor3 = Theme.Slider,
                BorderSizePixel = 0,
                AnchorPoint = Vector2.new(1, 0.5),
                Position = UDim2.new(1, -10, 0.5, 0),
                Size = UDim2.new(0, 60, 0, 24),
                AutoButtonColor = false,
                Parent = frame,
            })
            addCorner(bindBtn, 6)

            local listening = false
            bindBtn.MouseButton1Click:Connect(function()
                if listening then return end
                listening = true
                bindBtn.Text = "..."

                local conn
                conn = UserInputService.InputBegan:Connect(function(input, gpe)
                    if input.UserInputType == Enum.UserInputType.Keyboard then
                        conn:Disconnect()
                        listening = false
                        local keyName = input.KeyCode.Name
                        keybind.CurrentKeybind = keyName
                        bindBtn.Text = "[" .. keyName .. "]"
                    end
                end)
            end)

            -- Listen for keybind press
            UserInputService.InputBegan:Connect(function(input, gpe)
                if gpe then return end
                if listening then return end
                if input.UserInputType == Enum.UserInputType.Keyboard then
                    local keyName = input.KeyCode.Name
                    if keyName == keybind.CurrentKeybind then
                        if cfg.Callback then task.spawn(cfg.Callback) end
                    end
                end
            end)

            if cfg.Flag then Library.Flags[cfg.Flag] = keybind end
            return keybind
        end

        -- ==========================
        -- LABEL
        -- ==========================
        function tab:CreateLabel(text)
            local labelObj = {Type = "Label"}

            local frame = create("Frame", {
                BackgroundColor3 = Theme.Card,
                BorderSizePixel = 0,
                Size = UDim2.new(1, 0, 0, 32),
                Parent = page,
            })
            addCorner(frame, 8)

            local lbl = create("TextLabel", {
                Text = text or "",
                FontFace = FONT_REGULAR,
                TextSize = 12,
                TextColor3 = Theme.TextDim,
                BackgroundTransparency = 1,
                Size = UDim2.new(1, 0, 1, 0),
                TextXAlignment = Enum.TextXAlignment.Left,
                TextWrapped = true,
                Parent = frame,
            })
            addPadding(lbl, 0, 0, 12, 12)

            function labelObj:Set(newText)
                lbl.Text = newText
            end

            return labelObj
        end

        return tab
    end

    -- ========================
    -- NOTIFICATIONS
    -- ========================
    function Library:Notify(cfg)
        local notif = create("Frame", {
            BackgroundColor3 = Theme.Notif,
            BorderSizePixel = 0,
            Size = UDim2.new(1, 0, 0, 0),
            ClipsDescendants = true,
            Parent = notifHolder,
        })
        addCorner(notif, 10)
        addStroke(notif, Theme.AccentDim, 1)

        local accent = create("Frame", {
            BackgroundColor3 = Theme.Accent,
            BorderSizePixel = 0,
            Size = UDim2.new(0, 3, 1, -8),
            AnchorPoint = Vector2.new(0, 0.5),
            Position = UDim2.new(0, 6, 0.5, 0),
            Parent = notif,
        })
        addCorner(accent, 2)

        local title = create("TextLabel", {
            Text = cfg.Title or "Notification",
            FontFace = FONT,
            TextSize = 13,
            TextColor3 = Theme.Text,
            BackgroundTransparency = 1,
            Position = UDim2.new(0, 16, 0, 8),
            Size = UDim2.new(1, -24, 0, 18),
            TextXAlignment = Enum.TextXAlignment.Left,
            TextTruncate = Enum.TextTruncate.AtEnd,
            Parent = notif,
        })

        local content = create("TextLabel", {
            Text = cfg.Content or "",
            FontFace = FONT_REGULAR,
            TextSize = 11,
            TextColor3 = Theme.TextDim,
            BackgroundTransparency = 1,
            Position = UDim2.new(0, 16, 0, 26),
            Size = UDim2.new(1, -24, 0, 30),
            TextXAlignment = Enum.TextXAlignment.Left,
            TextWrapped = true,
            TextYAlignment = Enum.TextYAlignment.Top,
            Parent = notif,
        })

        -- Progress bar at bottom
        local progressBg = create("Frame", {
            BackgroundColor3 = Theme.Slider,
            BorderSizePixel = 0,
            AnchorPoint = Vector2.new(0.5, 1),
            Position = UDim2.new(0.5, 0, 1, -4),
            Size = UDim2.new(1, -20, 0, 2),
            Parent = notif,
        })
        addCorner(progressBg, 1)

        local progressFill = create("Frame", {
            BackgroundColor3 = Theme.Accent,
            BorderSizePixel = 0,
            Size = UDim2.new(1, 0, 1, 0),
            Parent = progressBg,
        })
        addCorner(progressFill, 1)

        -- Animate in
        tw(notif, {Size = UDim2.new(1, 0, 0, 66)}, 0.3)

        local duration = cfg.Duration or 5
        tw(progressFill, {Size = UDim2.new(0, 0, 1, 0)}, duration)

        task.spawn(function()
            task.wait(duration)
            tw(notif, {Size = UDim2.new(1, 0, 0, 0)}, 0.3)
            task.wait(0.35)
            notif:Destroy()
        end)
    end

    -- ========================
    -- CONFIGURATION
    -- ========================
    function Library:SaveConfiguration()
        if not Library._configSaving or not Library._configSaving.Enabled then return end
        local data = {}
        for name, flag in pairs(Library.Flags) do
            if flag.Type == "Toggle" then
                data[name] = {T = "Toggle", V = flag.CurrentValue}
            elseif flag.Type == "Slider" then
                data[name] = {T = "Slider", V = flag.CurrentValue}
            elseif flag.Type == "Dropdown" then
                data[name] = {T = "Dropdown", V = flag.CurrentOption}
            elseif flag.Type == "Input" then
                data[name] = {T = "Input", V = flag.CurrentValue}
            elseif flag.Type == "ColorPicker" then
                local c = flag.Color
                data[name] = {T = "Color", V = {c.R, c.G, c.B}}
            elseif flag.Type == "Keybind" then
                data[name] = {T = "Keybind", V = flag.CurrentKeybind}
            end
        end
        local folder = Library._configSaving.FolderName or "CatsakenUI"
        local file = Library._configSaving.FileName or "Config"
        pcall(function()
            if not isfolder(folder) then makefolder(folder) end
            writefile(folder .. "/" .. file .. ".json", HttpService:JSONEncode(data))
        end)
    end

    function Library:LoadConfiguration()
        if not Library._configSaving or not Library._configSaving.Enabled then return end
        local folder = Library._configSaving.FolderName or "CatsakenUI"
        local file = Library._configSaving.FileName or "Config"
        local path = folder .. "/" .. file .. ".json"
        local ok, data = pcall(function()
            if not isfile(path) then return nil end
            return HttpService:JSONDecode(readfile(path))
        end)
        if not ok or not data then return end
        for name, info in pairs(data) do
            local flag = Library.Flags[name]
            if not flag then continue end
            pcall(function()
                if info.T == "Toggle" and flag.Type == "Toggle" then
                    flag:Set(info.V)
                elseif info.T == "Slider" and flag.Type == "Slider" then
                    flag:Set(info.V)
                elseif info.T == "Dropdown" and flag.Type == "Dropdown" then
                    flag.CurrentOption = info.V
                    flag.CurrentValue = info.V[1]
                elseif info.T == "Input" and flag.Type == "Input" then
                    flag.CurrentValue = info.V
                elseif info.T == "Color" and flag.Type == "ColorPicker" then
                    flag.Color = Color3.new(info.V[1], info.V[2], info.V[3])
                elseif info.T == "Keybind" and flag.Type == "Keybind" then
                    flag.CurrentKeybind = info.V
                end
            end)
        end
    end

    -- ========================
    -- DESTROY
    -- ========================
    function Library:Destroy()
        for _, conn in Library._connections do
            pcall(function() conn:Disconnect() end)
        end
        Library._connections = {}
        screenGui:Destroy()
    end

    -- ========================
    -- TOGGLE UI KEYBIND
    -- ========================
    UserInputService.InputBegan:Connect(function(input, gpe)
        if gpe then return end
        if input.KeyCode == Library._toggleKey then
            Library._visible = not Library._visible
            mainFrame.Visible = Library._visible
        end
    end)

    -- Auto-save periodically
    task.spawn(function()
        while task.wait(30) do
            pcall(function() Library:SaveConfiguration() end)
        end
    end)

    return Library
end

return CatsakenUI
