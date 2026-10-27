import { Request, Response } from 'express';
import * as bannerService from './service.js';
import { ApiResponse } from '../../shared/types/index.js';
import { HTTP_STATUS } from '../../shared/constants/index.js';
import type { CreateBannerInput, UpdateBannerInput, BannerUploadUrlInput } from './types.js';

export async function getActiveBannersHandler(_req: Request, res: Response): Promise<void> {
  const banners = await bannerService.getActiveBanners();

  const response: ApiResponse = {
    success: true,
    data: banners,
  };

  res.status(HTTP_STATUS.OK).json(response);
}

export async function listAllBannersHandler(_req: Request, res: Response): Promise<void> {
  const banners = await bannerService.listAllBanners();

  const response: ApiResponse = {
    success: true,
    data: banners,
  };

  res.status(HTTP_STATUS.OK).json(response);
}

export async function getBannerByIdHandler(req: Request, res: Response): Promise<void> {
  const id = req.params['id'] as string;
  const banner = await bannerService.getBannerById(id);

  const response: ApiResponse = {
    success: true,
    data: banner,
  };

  res.status(HTTP_STATUS.OK).json(response);
}

export async function createBannerHandler(req: Request, res: Response): Promise<void> {
  const input = req.body as CreateBannerInput;
  const banner = await bannerService.createBanner(input);

  const response: ApiResponse = {
    success: true,
    data: banner,
    message: 'Banner created successfully',
  };

  res.status(HTTP_STATUS.CREATED).json(response);
}

export async function updateBannerHandler(req: Request, res: Response): Promise<void> {
  const id = req.params['id'] as string;
  const input = req.body as UpdateBannerInput;
  const banner = await bannerService.updateBanner(id, input);

  const response: ApiResponse = {
    success: true,
    data: banner,
    message: 'Banner updated successfully',
  };

  res.status(HTTP_STATUS.OK).json(response);
}

export async function deleteBannerHandler(req: Request, res: Response): Promise<void> {
  const id = req.params['id'] as string;
  await bannerService.deleteBanner(id);

  const response: ApiResponse = {
    success: true,
    message: 'Banner deleted successfully',
  };

  res.status(HTTP_STATUS.OK).json(response);
}

export async function createBannerUploadUrlHandler(req: Request, res: Response): Promise<void> {
  const input = req.body as BannerUploadUrlInput;
  const uploadData = await bannerService.createBannerUploadUrl(input);

  const response: ApiResponse = {
    success: true,
    data: uploadData,
    message: 'Upload URL generated successfully',
  };

  res.status(HTTP_STATUS.CREATED).json(response);
}
