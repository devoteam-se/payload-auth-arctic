'use client';
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { useOAuthProviders } from '../hooks/useOAuthProviders.js';
/**
 * Provider icons - add more as needed
 */ const providerIcons = {
    entra: /*#__PURE__*/ _jsxs("svg", {
        width: "20",
        height: "20",
        viewBox: "0 0 21 21",
        xmlns: "http://www.w3.org/2000/svg",
        children: [
            /*#__PURE__*/ _jsx("rect", {
                x: "1",
                y: "1",
                width: "9",
                height: "9",
                fill: "#f25022"
            }),
            /*#__PURE__*/ _jsx("rect", {
                x: "11",
                y: "1",
                width: "9",
                height: "9",
                fill: "#7fba00"
            }),
            /*#__PURE__*/ _jsx("rect", {
                x: "1",
                y: "11",
                width: "9",
                height: "9",
                fill: "#00a4ef"
            }),
            /*#__PURE__*/ _jsx("rect", {
                x: "11",
                y: "11",
                width: "9",
                height: "9",
                fill: "#ffb900"
            })
        ]
    })
};
/**
 * Default icon for providers without a specific icon
 */ const defaultIcon = /*#__PURE__*/ _jsxs("svg", {
    width: "20",
    height: "20",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2",
    xmlns: "http://www.w3.org/2000/svg",
    children: [
        /*#__PURE__*/ _jsx("path", {
            d: "M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"
        }),
        /*#__PURE__*/ _jsx("polyline", {
            points: "10 17 15 12 10 7"
        }),
        /*#__PURE__*/ _jsx("line", {
            x1: "15",
            y1: "12",
            x2: "3",
            y2: "12"
        })
    ]
});
export const OAuthButtons = ({ userCollection } = {})=>{
    const { providers, disableLocalStrategy, login } = useOAuthProviders({
        userCollection
    });
    const [loadingProvider, setLoadingProvider] = useState(null);
    const handleClick = (provider)=>{
        setLoadingProvider(provider.key);
        login(provider);
    };
    if (providers.length === 0) {
        return null;
    }
    return /*#__PURE__*/ _jsxs("div", {
        style: {
            marginTop: '24px'
        },
        children: [
            !disableLocalStrategy && /*#__PURE__*/ _jsxs("div", {
                style: {
                    display: 'flex',
                    alignItems: 'center',
                    margin: '16px 0',
                    gap: '12px'
                },
                children: [
                    /*#__PURE__*/ _jsx("div", {
                        style: {
                            flex: 1,
                            height: '1px',
                            background: 'var(--theme-elevation-150)'
                        }
                    }),
                    /*#__PURE__*/ _jsx("span", {
                        style: {
                            color: 'var(--theme-elevation-400)',
                            fontSize: '13px'
                        },
                        children: "or"
                    }),
                    /*#__PURE__*/ _jsx("div", {
                        style: {
                            flex: 1,
                            height: '1px',
                            background: 'var(--theme-elevation-150)'
                        }
                    })
                ]
            }),
            /*#__PURE__*/ _jsx("div", {
                style: {
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px'
                },
                children: providers.map((provider)=>/*#__PURE__*/ _jsxs("button", {
                        type: "button",
                        onClick: ()=>handleClick(provider),
                        disabled: loadingProvider !== null,
                        style: {
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '10px',
                            width: '100%',
                            padding: '12px 16px',
                            border: '1px solid var(--theme-elevation-150)',
                            borderRadius: '4px',
                            background: 'var(--theme-elevation-50)',
                            cursor: loadingProvider !== null ? 'wait' : 'pointer',
                            fontSize: '14px',
                            fontFamily: 'inherit',
                            color: 'var(--theme-elevation-800)',
                            transition: 'background 0.15s ease',
                            opacity: loadingProvider !== null && loadingProvider !== provider.key ? 0.6 : 1
                        },
                        onMouseOver: (e)=>{
                            if (loadingProvider === null) {
                                e.currentTarget.style.background = 'var(--theme-elevation-100)';
                            }
                        },
                        onMouseOut: (e)=>{
                            e.currentTarget.style.background = 'var(--theme-elevation-50)';
                        },
                        children: [
                            providerIcons[provider.key] || defaultIcon,
                            loadingProvider === provider.key ? 'Redirecting...' : `Sign in with ${provider.displayName}`
                        ]
                    }, provider.key))
            })
        ]
    });
};

//# sourceMappingURL=OAuthButtons.js.map