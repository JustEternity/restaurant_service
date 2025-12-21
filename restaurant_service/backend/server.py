import uvicorn

if __name__ == "__main__":
    host = "0.0.0.0"
    port = 8000
    reload = True

    print(f"API: http://{host}:{port}")
    print(f"Документация: http://{host}:{port}/docs")

    uvicorn.run(
        "app.main:app",
        host=host,
        port=port,
        reload=reload,
        log_level="info"
    )