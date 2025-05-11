# ai-wallpaper

This project was generated using [Nx](https://nx.dev).

## Running the App

Run `npx nx serve ai-wallpaper` for a dev server.

## Build

Run `npx nx build ai-wallpaper` to build the project. The build artifacts will be stored in the `ai-wallpaper/dist` directory.

## Project Structure

Run `npx nx show project ai-wallpaper` to view the project structure.

## Further help

Visit the [Nx Documentation](https://nx.dev/getting-started/intro) to learn more.

## Building For Android

### Step 1: Bundle JavaScript code

```bash
npx nx bundle ai-wallpaper-android -- --entry-file=src/main.tsx --bundle-output=./android/app/src/main/assets/index.android.bundle --platform=android --dev=false
```

### Step 2: Build debug APK

```bash
cd ai-wallpaper-android/android && ./gradlew assembleDebug
```

The debug APK will be generated at:

```
ai-wallpaper-android/android/app/build/outputs/apk/debug/app-debug.apk
```

### Step 3: Install on a connected device

```bash
adb install -r ai-wallpaper-android/android/app/build/outputs/apk/debug/app-debug.apk
```

### Building release APK

To build a release version, configure signing keys in `android/app/build.gradle` and run:

```bash
cd ai-wallpaper-android/android && ./gradlew assembleRelease
```
