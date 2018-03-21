import * as Jimp from "jimp";
import * as Color from "color";
import { exported } from "../../common/decorators";

export const enum Operations {
	OverlayWith = "overlayWith",
	Blank = "blank",
	Resize = "resize"
}

export class AssetsGenerationService implements IAssetsGenerationService {
	private get propertiesToEnumerate(): IDictionary<string[]> {
		return {
			icon: ["icons"],
			splash: ["splashBackgrounds", "splashCenterImages", "splashImages"]
		};
	}

	constructor(private $logger: ILogger,
		private $projectDataService: IProjectDataService) {
	}

	@exported("assetsGenerationService")
	public async generateIcons(resourceGenerationData: IResourceGenerationData): Promise<void> {
		this.$logger.info("Generating icons ...");
		await this.generateImagesForDefinitions(resourceGenerationData, this.propertiesToEnumerate.icon);
		this.$logger.info("Icons generation completed.");
	}

	@exported("assetsGenerationService")
	public async generateSplashScreens(splashesGenerationData: ISplashesGenerationData): Promise<void> {
		this.$logger.info("Generating splash screens ...");
		await this.generateImagesForDefinitions(splashesGenerationData, this.propertiesToEnumerate.splash);
		this.$logger.info("Splash screens generation completed.");
	}

	private async generateImagesForDefinitions(generationData: ISplashesGenerationData, propertiesToEnumerate: string[]): Promise<void> {
		generationData.background = generationData.background || "white";
		const assetsStructure = await this.$projectDataService.getAssetsStructure(generationData);

		const assetItems = _(assetsStructure)
			.filter((assetGroup: IAssetGroup, platform: string) => {
				return !generationData.platform || platform.toLowerCase() === generationData.platform.toLowerCase();
			})
			.map((assetGroup: IAssetGroup) =>
				_.filter(assetGroup, (assetSubGroup: IAssetSubGroup, imageTypeKey: string) =>
					propertiesToEnumerate.indexOf(imageTypeKey) !== -1 && !assetSubGroup[imageTypeKey]
				)
			)
			.flatten<IAssetSubGroup>()
			.map(assetSubGroup => assetSubGroup.images)
			.flatten<IAssetItem>()
			.filter(assetItem => !!assetItem.filename)
			.value();

		for (const assetItem of assetItems) {
			const operation = assetItem.resizeOperation || Operations.Resize;
			const scale = assetItem.scale || 0.8;
			const outputPath = assetItem.path;

			switch (operation) {
				case Operations.OverlayWith:
					const imageResize = Math.round(Math.min(assetItem.width, assetItem.height) * scale);
					const image = await this.resize(generationData.imagePath, imageResize, imageResize);
					await this.generateImage(generationData.background, assetItem.width, assetItem.height, outputPath, image);
					break;
				case Operations.Blank:
					await this.generateImage(generationData.background, assetItem.width, assetItem.height, outputPath);
					break;
				case Operations.Resize:
					const resizedImage = await this.resize(generationData.imagePath, assetItem.width, assetItem.height);
					resizedImage.write(outputPath);
					break;
				default:
					throw new Error(`Invalid image generation operation: ${operation}`);
			}
		}
	}

	private async resize(imagePath: string, width: number, height: number): Promise<Jimp> {
		const image = await Jimp.read(imagePath);
		return image.scaleToFit(width, height);
	}

	private generateImage(background: string, width: number, height: number, outputPath: string, overlayImage?: Jimp): void {
		// Typescript declarations for Jimp are not updated to define the constructor with backgroundColor so we workaround it by casting it to <any> for this case only.
		const J = <any>Jimp;
		const backgroundColor = this.getRgbaNumber(background);
		let image = new J(width, height, backgroundColor);

		if (overlayImage) {
			const centeredWidth = (width - overlayImage.bitmap.width) / 2;
			const centeredHeight = (height - overlayImage.bitmap.height) / 2;
			image = image.composite(overlayImage, centeredWidth, centeredHeight);
		}

		image.write(outputPath);
	}

	private getRgbaNumber(colorString: string): number {
		const color = new Color(colorString);
		const colorRgb = color.rgb();
		const alpha = Math.round(colorRgb.alpha() * 255);

		return Jimp.rgbaToInt(colorRgb.red(), colorRgb.green(), colorRgb.blue(), alpha);
	}
}

$injector.register("assetsGenerationService", AssetsGenerationService);